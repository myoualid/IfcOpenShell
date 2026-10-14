import { Operator } from '../../ops/Operator.js';
import LoadIfc from './LoadIfc.js';
import LoadSampleIfc from './LoadSampleIfc.js';
import { Ifc, Loader, Scene } from '../../tool/index.js';
import { openModelFilePicker } from './open-file.js';

let nextProjectIndex = 1;

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
	// { engine, kernel, thread }.
	constructor( context, options = {} ) {

		super( context );
		this.options = options;

	}

	execute() {

		openModelFilePicker( ( file ) => {

			// The picker itself is not undoable. LoadIfc records the file.
			new LoadIfc( this.context, file, this.options ).run();

		} );
		return { status: 'FINISHED' };

	}

}

class ProjectClear extends Operator {

	static operatorName = 'project.clear';
	static operatorLabel = 'Clear Models';
	// Not undoable. Every recorded command refers to objects in the scene
	// being dropped, so the undo stack goes with them.
	execute() {

		Loader.clear();
		this.context.ops.clear();
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

			objects = await Scene.getObjects();
			hidden = new Set( Scene.getHidden() );

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

	execute() {

		const sourceId = typeof this.detail === 'number' ? this.detail : this.detail?.sourceId;
		const sessionModelId = typeof this.detail === 'object' ? this.detail?.sessionModelId : undefined;
		this.context.signals.modelLoaded.dispatch( { sourceId, sessionModelId } );
		return { status: 'FINISHED' };

	}

}

export function bindProject( bonsai ) {

	bonsai._viewerUnsubs.push( Loader.onLoaded( ( detail ) => {

		new ProjectModelLoaded( bonsai, detail ).run();

	} ) );
	const viewport = bonsai.app.viewport;
	if ( viewport ) {

		Loader.enableDragDrop( viewport, ( file ) => {

			new LoadIfc( bonsai, file ).run();

		} );

	}

}

export { ProjectClear, ProjectDownloadView, ProjectModelLoaded, ProjectModels, ProjectNew, ProjectOpenFile };
export default [ ProjectOpenFile, ProjectNew, ProjectClear, ProjectDownloadView, ProjectModels, ProjectModelLoaded, LoadIfc, LoadSampleIfc ];
