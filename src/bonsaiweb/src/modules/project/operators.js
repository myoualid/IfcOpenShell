import ops, { Operator } from '../../ops.js';
import { writeStoredZip } from '../../pipeline/zip.js';
import { Federation } from '../../tool/federation.js';
import { Ifc, Loader } from '../../tool/index.js';
import { Viewer, viewer } from '../../tool/Viewer.js';

// Resolved from the bundle in build/, not from this source file.
const SAMPLE_IFC_URL = new URL( '../app/files/ifc/window_wall.ifc', import.meta.url ).href;

let nextProjectIndex = 1;

function openModelFilePicker( onFile ) {

	const input = document.createElement( 'input' );
	input.type = 'file';
	input.accept = '.ifc,.ifcview,.ifcfed,.zip,application/zip';
	input.style.display = 'none';

	const cleanup = () => {

		window.removeEventListener( 'focus', onWindowFocus );
		input.remove();

	};

	const onWindowFocus = () => {

		setTimeout( () => {

			if ( input.isConnected ) cleanup();

		}, 300 );

	};

	window.addEventListener( 'focus', onWindowFocus );

	input.addEventListener(
		'change',
		() => {

			const file = input.files?.[ 0 ] ?? null;
			cleanup();
			if ( file ) onFile( file );

		},
		{ once: true },
	);
	input.addEventListener( 'cancel', cleanup, { once: true } );

	document.body.appendChild( input );
	input.click();

}

// Loader options for one load: the geometry overrides { kernel, thread, delivery },
// plus hooks that re-dispatch conversion progress and the live IFC.
function loadOptions( context, options ) {

	return {
		...options,
		onConvertProgress: ( progress ) => {

			context.signals.modelLoadStarted.dispatch( { source: 'convert', ...progress } );

		},
		onLiveIfc: ( payload ) => {

			context.signals.liveIfcReady.dispatch( payload );
			if ( context.store.selection ) {

				context.signals.objectPicked.dispatch( context.store.selection );

			}

		},
	};

}

class LoadIfc extends Operator {

	static operatorName = 'load.ifc';
	static operatorLabel = 'Load IFC';

	constructor( context, urlOrFile, options = {} ) {

		super( context );
		this.file = ( typeof File !== 'undefined' && urlOrFile instanceof File ) ? urlOrFile : null;
		this.url = this.file ? '' : ( urlOrFile ?? '' );
		this.options = options;

	}

	poll() {

		return Boolean( Viewer.get() && ( this.file || this.url ) );

	}

	// Async; callers that need completion listen to signals.modelLoaded.
	// Not undoable: the viewer cannot drop one model without clearing all.
	execute() {

		this.context.signals.modelLoadStarted.dispatch( {
			source: this.file ? 'file' : 'url',
			name: this.file?.name || this.url,
		} );

		const options = loadOptions( this.context, this.options );
		const pending = this.file
			? Loader.loadLocalFile( this.file, options )
			: Loader.loadIfcUrl( this.url, options );

		return pending.catch( ( err ) => {

			console.error( err );

		} );

	}

}

class LoadSampleIfc extends Operator {

	static operatorName = 'load.sample.ifc';
	static operatorLabel = 'Load Sample IFC';

	constructor( context, options = {} ) {

		super( context );
		this.options = options;

	}

	poll() {

		return Boolean( Viewer.get() );

	}

	async execute() {

		const url = SAMPLE_IFC_URL;
		this.context.signals.modelLoadStarted.dispatch( { source: 'url', name: url } );
		return Loader.loadIfcUrl( url, loadOptions( this.context, this.options ) );

	}

}

function nextEditSourceId( models ) {

	let id = - 1;
	const used = new Set( models.map( ( entry ) => entry.sourceId ) );
	while ( used.has( id ) ) id -= 1;
	return id;

}

function takeProjectName( models ) {

	const used = new Set();
	for ( const entry of models ) {

		if ( entry.name ) used.add( entry.name.toLowerCase() );
		if ( entry.viewName ) used.add( entry.viewName.toLowerCase() );

	}

	for ( ;; ) {

		const index = nextProjectIndex ++;
		const stem = index === 1 ? 'Project' : `Project ${ index }`;
		const filename = `${ stem }.ifc`;
		if ( used.has( filename.toLowerCase() ) || used.has( `${ stem.toLowerCase() }.ifcview` ) ) continue;
		return { stem, filename };

	}

}

class ProjectNew extends Operator {

	static operatorName = 'project.new';
	static operatorLabel = 'New Project';

	async execute() {

		const { stem, filename } = takeProjectName( this.context.store.models );
		try {

			const file = await Ifc.createBlank( stem );
			// No sidecar and no viewer source. A negative id stays out of
			// the viewer's source list, which counts up from 0.
			const sourceId = nextEditSourceId( this.context.store.models );
			Ifc.setEdit( sourceId, file, filename );
			this.context.signals.liveIfcReady.dispatch( { sourceId, name: filename, file } );
			return { status: 'FINISHED' };

		} catch ( err ) {

			console.error( err );
			return { status: 'CANCELLED' };

		}

	}

}

class ProjectOpenFile extends Operator {

	static operatorName = 'project.open_file';
	static operatorLabel = 'Load IFC';

	// `options` overrides configuration.geometry for this load:
	// { kernel, thread, delivery }.
	constructor( context, options = {} ) {

		super( context );
		this.options = options;

	}

	execute() {

		openModelFilePicker( ( file ) => {

			// The picker itself is not undoable. LoadIfc records the file.
			ops.execute( 'load.ifc', this.context, file, this.options );

		} );
		return { status: 'FINISHED' };

	}

}

class ProjectOpenBag extends Operator {

	static operatorName = 'project.open_bag';
	static operatorLabel = 'Open Project';

	constructor( context, entries, label, options = {} ) {

		super( context );
		this.entries = entries;
		this.label = label;
		this.options = options;

	}

	poll() {

		return Boolean( Viewer.get() && this.entries?.length );

	}

	execute() {

		this.context.signals.modelLoadStarted.dispatch( {
			source: 'project',
			name: this.label || 'project.ifcfed',
		} );
		return Loader.openProjectBag( this.entries, loadOptions( this.context, this.options ), this.label )
			.catch( ( err ) => {

				console.error( err );
				return { status: 'CANCELLED' };

			} );

	}

}

class ProjectDownload extends Operator {

	static operatorName = 'project.download';
	static operatorLabel = 'Download Project';

	poll() {

		return Boolean( Viewer.get() );

	}

	async execute() {

		const encoder = new TextEncoder();
		for ( const entry of this.context.store.models ) {

			Federation.ensureLocal( entry.sourceId, entry.name || entry.viewName || 'model.ifc' );

		}

		const payload = new Map();
		for ( const entry of this.context.store.models ) {

			const model = Federation.modelForSource( entry.sourceId );
			if ( ! model ) continue;
			const bundle = Loader.bundle( entry.sourceId );
			let ifc = bundle?.ifc?.data
				? { name: bundle.ifc.name, data: bundle.ifc.data }
				: null;
			if ( ! ifc ) {

				const file = Ifc.file( entry.sourceId );
				if ( file?.toString ) {

					const data = encoder.encode( file.toString() );
					ifc = { name: Ifc.get( entry.sourceId )?.name || entry.name || 'model.ifc', data };

				}

			}

			let view = null;
			const viewFile = bundle?.view?.file;
			if ( viewFile ) {

				view = {
					name: bundle.view.name,
					data: new Uint8Array( await viewFile.arrayBuffer() ),
				};

			}

			payload.set( model.id, { ifc, view } );

		}

		Federation.captureViewer( viewer );
		const archive = Federation.archiveFiles( payload );
		if ( archive.warnings.length ) console.warn( archive.warnings.join( '\n' ) );
		const data = writeStoredZip( archive.files );
		await Loader.saveFile( new File( [ data ], archive.filename ) );
		return { status: 'FINISHED', warnings: archive.warnings };

	}

}

class ProjectClear extends Operator {

	static operatorName = 'project.clear';
	static operatorLabel = 'Clear Models';
	// Not undoable. Every recorded command refers to objects in the scene
	// being dropped, so the undo stack goes with them.
	execute() {

		Loader.clear();
		ops.clear();
		this.context.signals.modelCleared.dispatch();
		return { status: 'FINISHED' };

	}

}

class ProjectDownloadView extends Operator {

	static operatorName = 'project.download_view';
	static operatorLabel = 'Download View';

	constructor( context, sourceId ) {

		super( context );
		this.sourceId = sourceId;

	}

	poll() {

		const bundle = Loader.bundle( this.sourceId );
		return Boolean( bundle?.ifc || bundle?.view || Ifc.file( this.sourceId ) );

	}

	execute() {

		const dialog = this.context.viewCacheDialog;
		if ( ! dialog ) return { status: 'CANCELLED' };
		dialog.toggle( this.sourceId );
		return { status: 'FINISHED' };

	}

}

class ProjectModels extends Operator {

	static operatorName = 'project.models';
	static operatorLabel = 'List Models';

	async execute() {

		let hidden = new Set();
		let objects = [];
		try {

			objects = await viewer.getObjects();
			hidden = new Set( viewer.getHidden() );

		} catch { /* element table is not ready until the first model is drawn */ }

		/** @type {Map<number, number[]>} */
		const bySource = new Map();
		for ( const object of objects ) {

			if ( object.objectId <= 0 || object.sourceId == null ) continue;
			const ids = bySource.get( object.sourceId ) ?? [];
			ids.push( object.objectId );
			bySource.set( object.sourceId, ids );

		}

		const rows = [];
		for ( const [ sourceId, objectIds ] of bySource ) {

			rows.push( {
				sourceId,
				objectIds,
				checked: objectIds.some( ( id ) => ! hidden.has( id ) ),
			} );

		}

		return { status: 'FINISHED', result: rows };

	}

}

class ProjectModelLoaded extends Operator {

	static operatorName = 'project.model_loaded';
	static operatorLabel = 'Model Loaded';

	constructor( context, detail ) {

		super( context );
		this.detail = detail;

	}

	async execute() {

		const sourceId = typeof this.detail === 'number' ? this.detail : this.detail?.sourceId;
		const sessionModelId = typeof this.detail === 'object' ? this.detail?.sessionModelId : undefined;
		this.context.signals.modelLoaded.dispatch( { sourceId, sessionModelId } );
		Federation.modelArrived( viewer );
		const model = Federation.modelForSource( sourceId );
		if ( model && ! Federation.isEffectivelyVisible( model ) ) {

			try {

				const objects = await viewer.getObjects();
				const ids = objects
					.filter( ( object ) => object.sourceId === sourceId && object.objectId > 0 )
					.map( ( object ) => object.objectId );
				if ( ids.length ) {

					viewer.hide( ids );
					this.context.signals.visibilityChanged.dispatch( { action: 'hide', target: ids } );

				}

			} catch { /* element table is not resident yet */ }

		}

		return { status: 'FINISHED' };

	}

}

class ProjectBenchmark extends Operator {

	static operatorName = 'project.benchmark';
	static operatorLabel = 'Benchmark IFC';

	// `input` is a File, a URL, or IFC bytes. `options` is { kernel, thread,
	// numThreads, settings, filename, keepSidecar }.
	constructor( context, input, options = {} ) {

		super( context );
		this.input = input;
		this.options = options;

	}

	poll() {

		return this.input != null;

	}

	execute() {

		return Loader.benchmark( this.input, this.options ).then( ( report ) => ( {
			status: 'FINISHED',
			report,
		} ) );

	}

}

export { LoadIfc, LoadSampleIfc, ProjectBenchmark, ProjectClear, ProjectDownload, ProjectDownloadView, ProjectModelLoaded, ProjectModels, ProjectNew, ProjectOpenBag, ProjectOpenFile };
export default [ ProjectOpenFile, ProjectOpenBag, ProjectDownload, ProjectNew, ProjectClear, ProjectDownloadView, ProjectModels, ProjectModelLoaded, LoadIfc, LoadSampleIfc, ProjectBenchmark ];
