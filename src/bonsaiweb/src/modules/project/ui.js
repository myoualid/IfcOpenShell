import {
	Badge,
	FloatingDialog,
	InputList,
	LabeledBoxItem,
	Operator as IconButton,
	StackPanel,
	Text,
} from '@aeco-dev/gui';

import { writeStoredZip } from '../../pipeline/zip.js';
import { Ifc, Loader } from '../../tool/index.js';
import { HideSelectionOperator } from '../viewer/HideSelectionOperator.js';
import { ShowSelectionOperator } from '../viewer/ShowOperator.js';
import { ProjectDownloadView, ProjectModels } from './operators.js';

function formatBytes( bytes ) {

	if ( bytes < 1024 ) return `${ bytes } B`;
	const units = [ 'KB', 'MB', 'GB' ];
	let size = bytes / 1024;
	let unit = 0;
	while ( size >= 1024 && unit < units.length - 1 ) {

		size /= 1024;
		unit += 1;

	}

	const digits = size >= 10 ? 0 : 1;
	return `${ size.toFixed( digits ) } ${ units[ unit ] }`;

}

function zipBytes( names, payloadBytes ) {

	const encoder = new TextEncoder();
	let overhead = 22;
	for ( const name of names ) overhead += 76 + ( encoder.encode( name ).byteLength * 2 );
	return overhead + payloadBytes;

}

function liveIfc( sourceId ) {

	const cached = Loader.bundle( sourceId )?.ifc;
	if ( cached ) return cached;
	const file = Ifc.file( sourceId );
	if ( ! file?.toString ) return null;
	const data = new TextEncoder().encode( file.toString() );
	const name = Ifc.get( sourceId )?.name || 'model.ifc';
	return { name, bytes: data.byteLength, data };

}

function row( ...children ) {

	return new StackPanel( { isVertical: false } )
		.gap( '0.5rem' )
		.setStyle( 'alignItems', [ 'center' ] )
		.setStyle( 'flexWrap', [ 'wrap' ] )
		.add( ...children );

}

class ProjectPanelUI {

	static id = 'project';

	static spec = {
		group: 'project',
		position: 'left',
		id: 'project-panel',
		label: 'Project',
		icon: 'folder_open',
		title: 'Federation',
	};

	constructor( { context } ) {

		this.context = context;
		this._badge = new Badge( '0 models' );
		this._visibleCaption = new Badge( '0 visible' );
		this._list = new InputList();
		this._list.dom.setAttribute( 'aria-label', 'models' );
		this._viewDialog = new FloatingDialog( {
			title: 'Download',
			icon: 'download',
			panelStyles: { width: '22rem' },
		} );
		this._downloadSourceId = null;
		context.viewCacheDialog = {
			toggle: ( sourceId ) => {

				if ( this._viewDialog.isActive && this._downloadSourceId === sourceId ) {

					this._viewDialog.hide();
					return;

				}

				this._downloadSourceId = sourceId;
				this._fillDownload( sourceId );
				if ( ! this._viewDialog.isActive ) this._viewDialog.show();

			},
		};

		this.root = new StackPanel( { isVertical: true } )
			.gap( '0.75rem' )
			.add(
				row( this._badge, this._visibleCaption ),
				this._list,
			);

		const { signals } = context;
		signals.modelLoaded.add( () => this.refresh() );
		signals.liveIfcReady.add( () => this.refresh() );
		signals.modelCleared.add( () => {

			this._viewDialog.hide();
			this.refresh();

		} );
		signals.historyChanged.add( ( cmd ) => {

			const name = cmd?.constructor.operatorName;
			if ( name === 'hide.selection' || name === 'show.selection' ) this.refresh();

		} );

		this.refresh();

	}

	_downloadIcon( onClick ) {

		const icon = new IconButton( 'download' ).setTooltip( 'Download' );
		icon.setStyle( 'cursor', [ 'pointer' ] );
		icon.dom.addEventListener( 'click', ( event ) => {

			event.preventDefault();
			event.stopPropagation();
			onClick();

		} );
		return icon;

	}

	_fillDownload( sourceId ) {

		const ifc = liveIfc( sourceId );
		const view = Loader.bundle( sourceId )?.view ?? null;
		const body = new StackPanel( { isVertical: true } ).gap( '0.5rem' );
		body.add( this._fileRow( ifc?.name ?? 'model.ifc', ifc, () => {

			void Loader.saveFile( new File( [ ifc.data ], ifc.name ) );

		} ) );
		body.add( this._fileRow( view?.name ?? 'model.ifcview', view, () => {

			void Loader.saveFile( view.file );

		} ) );

		const zipName = `${ ( ifc?.name ?? view?.name ?? 'model' ).replace( /\.(ifc|ifcview)$/i, '' ) }.zip`;
		const zip = ( ifc && view )
			? { name: zipName, bytes: zipBytes( [ ifc.name, view.name ], ifc.bytes + view.bytes ) }
			: null;
		body.add( this._fileRow( zipName, zip, async () => {

			const viewBytes = new Uint8Array( await view.file.arrayBuffer() );
			const data = writeStoredZip( [
				{ name: ifc.name, data: ifc.data },
				{ name: view.name, data: viewBytes },
			] );
			void Loader.saveFile( new File( [ data ], zipName ) );

		} ) );
		this._viewDialog.content( body );

	}

	_fileRow( name, payload, onDownload ) {

		const line = row( new Text( name ), new Badge( payload ? formatBytes( payload.bytes ) : '—' ) );
		if ( payload ) line.add( this._downloadIcon( () => onDownload() ) );
		return line;

	}

	async refresh() {

		const token = ( this._refreshToken ?? 0 ) + 1;
		this._refreshToken = token;

		const { result } = await new ProjectModels( this.context ).run();
		if ( token !== this._refreshToken ) return;

		const visibility = new Map( ( result ?? [] ).map( ( row ) => [ row.sourceId, row ] ) );
		const models = this.context.store.models.map( ( entry ) => {

			const sourceId = entry.sourceId;
			const row = visibility.get( sourceId );
			return {
				id: `model-${ sourceId }`,
				label: entry.name || entry.viewName || `Model ${ sourceId }`,
				checked: row?.checked ?? true,
				sourceId,
				objectIds: row?.objectIds ?? [],
			};

		} );

		this._list.clear();
		const visibleCount = models.filter( ( model ) => model.checked ).length;
		this._badge.setValue( `${ models.length } model${ models.length === 1 ? '' : 's' }` );
		this._visibleCaption.setValue( `${ visibleCount } visible` );

		for ( const model of models ) {

			const item = new LabeledBoxItem(
				{ id: model.id, label: model.label, checked: model.checked },
				{ [ model.id ]: 'folder_open', default: 'folder_open' },
			);
			const checkbox = item.dom.querySelector( 'input[type="checkbox"]' );
			checkbox?.addEventListener( 'change', () => {

				this._setModelVisible( model.objectIds, checkbox.checked );

			} );
			const actions = item.dom.querySelector( '.LabeledBoxItem-actions' );
			actions?.appendChild( this._downloadIcon( () => {

				new ProjectDownloadView( this.context, model.sourceId ).run();

			} ).dom );
			this._list.add( item );

		}

	}

	_setModelVisible( objectIds, visible ) {

		if ( ! objectIds?.length ) return;
		const OperatorClass = visible ? ShowSelectionOperator : HideSelectionOperator;
		new OperatorClass( this.context, objectIds ).run();

	}

}

export default [ ProjectPanelUI ];
