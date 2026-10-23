import {
	Badge,
	FloatingDialog,
	InputList,
	InputNumber,
	LabeledBoxItem,
	Operator as IconButton,
	StackPanel,
	Text,
	Tooltip,
} from '@aeco-dev/gui';

import { store } from '../../context/store.js';
import ops from '../../ops.js';
import { writeStoredZip } from '../../pipeline/zip.js';
import { Federation } from '../../tool/federation.js';
import { Ifc, Loader } from '../../tool/index.js';

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
	const file = Ifc.get( sourceId );
	if ( ! file?.toString ) return null;
	const data = new TextEncoder().encode( file.toString() );
	const name = store.models.find( ( entry ) => entry.id === sourceId )?.name || 'model.ifc';
	return { name, bytes: data.byteLength, data };

}

function row( ...children ) {

	return new StackPanel( { isVertical: false } )
		.gap( '0.5rem' )
		.setStyle( 'alignItems', [ 'center' ] )
		.setStyle( 'flexWrap', [ 'wrap' ] )
		.add( ...children );

}

function coordInput() {

	const input = new InputNumber( 0 ).setPrecision( 4 ).setStep( 1 ).setNudge( 0.01 );
	input.setValue( 0 );
	input.setStyle( 'width', [ '100%' ] );
	return input;

}

function angleInput() {

	const input = new InputNumber( 0 ).setPrecision( 2 ).setStep( 1 ).setNudge( 0.1 );
	input.setValue( 0 );
	input.setStyle( 'width', [ '6rem' ] );
	return input;

}

function hint( control, text ) {

	new Tooltip( text ).attachTo( control );
	return control;

}

function labeled( label, control, tip ) {

	const caption = new Text( label );
	caption.setStyle( 'fontSize', [ '0.7rem' ] );
	if ( tip && ! control._hinted ) {

		hint( control, tip );
		control._hinted = true;

	}

	return new StackPanel( { isVertical: true } )
		.gap( '0.15rem' )
		.setStyle( 'flex', [ '1' ] )
		.setStyle( 'minWidth', [ '4.25rem' ] )
		.add( caption, control );

}

function originFields( onEdit ) {

	const fields = {
		x: coordInput(),
		y: coordInput(),
		z: coordInput(),
		north: angleInput(),
		hold: false,
		seed: '',
	};
	for ( const input of [ fields.x, fields.y, fields.z, fields.north ] ) {

		input.dom.addEventListener( 'input', () => {

			fields.hold = true;
			onEdit( fields );

		} );
		input.onChange( () => onEdit( fields ) );

	}

	return fields;

}

function readLive( fields ) {

	const nums = [ fields.x, fields.y, fields.z, fields.north ].map( ( input ) => {

		const raw = input.dom.value.trim();
		if ( raw === '' || raw === '-' || raw === '.' || raw === '-.' ) return null;
		const n = Number( raw );
		return Number.isFinite( n ) ? n : null;

	} );
	if ( nums.some( ( n ) => n == null ) ) return null;
	return { xyz: nums.slice( 0, 3 ), rzDeg: nums[ 3 ] };

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
		this._modelFields = new Map();
		this._applying = false;

		this._viewDialog = new FloatingDialog( {
			title: 'Download',
			icon: 'download',
			panelStyles: { width: '22rem' },
		} );
		this._downloadSourceId = null;
		this._positionDialog = new FloatingDialog( {
			title: 'Position',
			icon: 'open_with',
			panelStyles: { width: '22rem' },
		} );
		this._positionSourceId = null;
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

		const save = new IconButton( 'download' ).setTooltip( 'Download project' );
		save.setStyle( 'cursor', [ 'pointer' ] );
		save.dom.addEventListener( 'click', ( event ) => {

			event.preventDefault();
			event.stopPropagation();
			ops.Project.Download();

		} );

		this.root = new StackPanel( { isVertical: true } )
			.gap( '0.75rem' )
			.add(
				row( this._badge, this._visibleCaption, save ),
				this._list,
			);

		const { signals } = context;
		signals.viewerReady.add( () => this.refresh() );
		signals.modelLoaded.add( () => this.refresh() );
		signals.liveIfcReady.add( () => this.refresh() );
		signals.modelCleared.add( () => {

			this._viewDialog.hide();
			this._positionDialog.hide();
			this._positionSourceId = null;
			this.refresh();

		} );
		signals.visibilityChanged.add( () => this.refresh() );

		this.refresh();

	}

	_positionIcon( sourceId, label ) {

		const icon = new IconButton( 'open_with' ).setTooltip( 'Position' );
		icon.setStyle( 'cursor', [ 'pointer' ] );
		icon.dom.addEventListener( 'click', ( event ) => {

			event.preventDefault();
			event.stopPropagation();
			this._togglePosition( sourceId, label );

		} );
		return icon;

	}

	_togglePosition( sourceId, label ) {

		if ( this._positionDialog.isActive && this._positionSourceId === sourceId ) {

			this._positionDialog.hide();
			return;

		}

		this._positionSourceId = sourceId;
		this._fillPosition( sourceId, label );
		if ( ! this._positionDialog.isActive ) this._positionDialog.show();

	}

	_fillPosition( sourceId, label ) {

		const fields = this._fieldsFor( sourceId );
		const stored = Federation.modelForSource( sourceId )?.transform;
		if ( stored && ! fields.hold ) {

			fields.x.setValue( stored.b[ 0 ] );
			fields.y.setValue( stored.b[ 1 ] );
			fields.z.setValue( stored.b[ 2 ] );
			fields.north.setValue( stored.rxyzDeg[ 2 ] );

		}

		this._positionDialog.setTitle( label || 'Position' );
		this._positionDialog.content( new StackPanel( { isVertical: true } )
			.gap( '0.5rem' )
			.add(
				row(
					labeled( 'X', fields.x, 'World X where this model’s origin is placed.' ),
					labeled( 'Y', fields.y, 'World Y where this model’s origin is placed.' ),
					labeled( 'Z', fields.z, 'World Z where this model’s origin is placed.' ),
				),
				labeled( 'Grid °', fields.north, 'Grid north for this model, in degrees, about the survey point.' ),
			) );

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

		const { result } = await ops.Project.ListModels();
		if ( token !== this._refreshToken ) return;

		const visibility = new Map( ( result ?? [] ).map( ( row ) => [ row.sourceId, row ] ) );
		const models = store.models.map( ( entry ) => {

			const sourceId = entry.id;
			const row = visibility.get( sourceId );
			return {
				id: `model-${ sourceId }`,
				label: entry.name || `Model ${ sourceId }`,
				checked: row?.checked ?? true,
				sourceId,
				objectIds: row?.objectIds ?? [],
			};

		} );

		this._list.clear();
		const visibleCount = models.filter( ( model ) => model.checked ).length;
		this._badge.setValue( `${ models.length } model${ models.length === 1 ? '' : 's' }` );
		this._visibleCaption.setValue( `${ visibleCount } visible` );

		const ids = new Set( models.map( ( model ) => model.sourceId ) );
		for ( const id of this._modelFields.keys() ) {

			if ( ! ids.has( id ) ) this._modelFields.delete( id );

		}

		if ( this._positionSourceId != null && ! ids.has( this._positionSourceId ) ) {

			this._positionDialog.hide();
			this._positionSourceId = null;

		}

		for ( const model of models ) {

			const item = new LabeledBoxItem(
				{ id: model.id, label: model.label, checked: model.checked },
				{ [ model.id ]: 'folder_open', default: 'folder_open' },
			);
			const checkbox = item.dom.querySelector( 'input[type="checkbox"]' );
			checkbox?.addEventListener( 'change', () => {

				this._setModelVisible( model.sourceId, model.objectIds, checkbox.checked );

			} );
			const actions = item.dom.querySelector( '.LabeledBoxItem-actions' );
			actions?.appendChild( this._syncIcon( () => this._resetModel( model.sourceId ) ).dom );
			actions?.appendChild( this._positionIcon( model.sourceId, model.label ).dom );
			actions?.appendChild( this._downloadIcon( () => {

				ops.Project.DownloadView( model.sourceId );

			} ).dom );
			if ( this._positionDialog.isActive && this._positionSourceId === model.sourceId ) {

				this._positionDialog.setTitle( model.label );

			}

			this._list.add( item );

		}

	}

	_syncIcon( onClick ) {

		const icon = new IconButton( 'sync' ).setTooltip( 'Reset placement' );
		icon.setStyle( 'cursor', [ 'pointer' ] );
		icon.dom.addEventListener( 'click', ( event ) => {

			event.preventDefault();
			event.stopPropagation();
			onClick();

		} );
		return icon;

	}

	_fieldsFor( sourceId ) {

		let fields = this._modelFields.get( sourceId );
		if ( fields ) return fields;
		fields = originFields( () => this._applyModel( sourceId, fields ) );
		this._modelFields.set( sourceId, fields );
		return fields;

	}

	_applyModel( sourceId, fields ) {

		if ( this._applying ) return;
		const pose = readLive( fields );
		if ( ! pose ) return;
		const pivot = store.scene.falseOrigin?.xyz ?? [ 0, 0, 0 ];
		ops.Scene.SetModelTransform( sourceId, {
			aFrame: 'global',
			a: [ 0, 0, 0 ],
			b: pose.xyz,
			rotationDeg: [ 0, 0, pose.rzDeg ],
			pivot,
		} );

	}

	_resetModel( sourceId ) {

		const fields = this._modelFields.get( sourceId );
		this._applying = true;
		ops.Scene.ClearModelTransform( sourceId );
		if ( fields ) {

			fields.hold = false;
			fields.seed = '';
			fields.x.setValue( 0 );
			fields.y.setValue( 0 );
			fields.z.setValue( 0 );
			fields.north.setValue( 0 );

		}

		this._applying = false;

	}

	_setModelVisible( sourceId, objectIds, visible ) {

		Federation.setVisible( sourceId, visible );
		if ( ! objectIds?.length ) return;
		( visible ? ops.Viewer.ShowSelected : ops.Viewer.HideSelected )( objectIds );

	}

}

export default [ ProjectPanelUI ];
