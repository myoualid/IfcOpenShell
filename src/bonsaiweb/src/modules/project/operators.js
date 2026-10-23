import ops, { Operator } from '../../ops.js';
import { writeStoredZip } from '../../pipeline/zip.js';
import { Federation } from '../../tool/federation.js';
import { Ifc, Loader } from '../../tool/index.js';
import { store } from '../../context/store.js';
import { Viewer } from '../../tool/Viewer.js';

// Real file is app/files/ifc/window_wall.ifc. scripts/build.mjs copies it to
// dist/window_wall.ifc. The name is split so esbuild leaves this URL
// relative to the output file.
const SAMPLE_IFC_URL = new URL( './window_wall.' + 'ifc', import.meta.url ).href;

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
			if ( context.activeObject ) context.signals.objectPicked.dispatch( context.activeObject );

		},
	};

}

class LoadIfc extends Operator {

	static operatorName = 'Project.LoadIfc';
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

	static operatorName = 'Project.LoadSample';
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

function takeProjectName( models ) {

	const used = new Set();
	for ( const entry of models ) {

		if ( entry.name ) used.add( entry.name.toLowerCase() );

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

	static operatorName = 'Project.New';
	static operatorLabel = 'New Project';

	async execute() {

		const { stem, filename } = takeProjectName( store.models );
		try {

			const file = await Ifc.createBlank( stem );
			// Reserve the next viewer source id without streaming it, so a
			// later addFile does not reuse this model's id.
			const sourceId = Viewer.get().registerFileSource( new Blob() );
			Ifc.set( sourceId, filename, file );
			this.context.signals.liveIfcReady.dispatch( { sourceId, name: filename, file } );
			return { status: 'FINISHED' };

		} catch ( err ) {

			console.error( err );
			return { status: 'CANCELLED' };

		}

	}

}

class ProjectOpenFile extends Operator {

	static operatorName = 'Project.OpenFile';
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
			ops.Project.LoadIfc( file, this.options );

		} );
		return { status: 'FINISHED' };

	}

}

class ProjectOpenBag extends Operator {

	static operatorName = 'Project.OpenBag';
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

	static operatorName = 'Project.Download';
	static operatorLabel = 'Download Project';

	poll() {

		return Boolean( Viewer.get() );

	}

	async execute() {

		const encoder = new TextEncoder();
		for ( const entry of store.models ) {

			Federation.ensureLocal( entry.id, entry.name || 'model.ifc' );

		}

		const payload = new Map();
		for ( const entry of store.models ) {

			const model = Federation.modelForSource( entry.id );
			if ( ! model ) continue;
			const bundle = Loader.bundle( entry.id );
			let ifc = bundle?.ifc?.data
				? { name: bundle.ifc.name, data: bundle.ifc.data }
				: null;
			if ( ! ifc ) {

				const file = Ifc.get( entry.id );
				if ( file?.toString ) {

					const data = encoder.encode( file.toString() );
					ifc = { name: entry.name || 'model.ifc', data };

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

		Federation.captureViewer();
		const archive = Federation.archiveFiles( payload );
		if ( archive.warnings.length ) console.warn( archive.warnings.join( '\n' ) );
		const data = writeStoredZip( archive.files );
		await Loader.saveFile( new File( [ data ], archive.filename ) );
		return { status: 'FINISHED', warnings: archive.warnings };

	}

}

class ProjectClear extends Operator {

	static operatorName = 'Project.Clear';
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

	static operatorName = 'Project.DownloadView';
	static operatorLabel = 'Download View';

	constructor( context, sourceId ) {

		super( context );
		this.sourceId = sourceId;

	}

	poll() {

		const bundle = Loader.bundle( this.sourceId );
		return Boolean( bundle?.ifc || bundle?.view || Ifc.get( this.sourceId ) );

	}

	execute() {

		const dialog = this.context.viewCacheDialog;
		if ( ! dialog ) return { status: 'CANCELLED' };
		dialog.toggle( this.sourceId );
		return { status: 'FINISHED' };

	}

}

class ProjectModels extends Operator {

	static operatorName = 'Project.ListModels';
	static operatorLabel = 'List Models';

	async execute() {

		let hidden = new Set();
		let objects = [];
		try {

			objects = await Viewer.get().getObjects();
			hidden = new Set( Viewer.get().getHidden() );

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

class ProjectBenchmark extends Operator {

	static operatorName = 'Project.Benchmark';
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

export { LoadIfc, LoadSampleIfc, ProjectBenchmark, ProjectClear, ProjectDownload, ProjectDownloadView, ProjectModels, ProjectNew, ProjectOpenBag, ProjectOpenFile };
export default [ ProjectOpenFile, ProjectOpenBag, ProjectDownload, ProjectNew, ProjectClear, ProjectDownloadView, ProjectModels, LoadIfc, LoadSampleIfc, ProjectBenchmark ];
