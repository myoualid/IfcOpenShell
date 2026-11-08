import { Operator } from '../../ops.js';
import { measure, resolvePick } from '../../tool/measure.js';
import { Scene } from '../../tool/Scene.js';
import { Viewer } from '../../tool/Viewer.js';
import { createLogger } from '../../util/log.js';

const log = createLogger( 'bonsai' );

// Undoable visibility commands capture their ids on the first execute, so
// redo (execute again) reuses them.

class HideSelectionOperator extends Operator {

	static operatorName = 'Viewer.HideSelected';
	static operatorLabel = 'Hide Selection';
	static undoable = true;

	constructor( context, ids ) {

		super( context );
		this.ids = Array.isArray( ids ) ? [ ...ids ] : [];

	}

	execute() {

		if ( this.ids.length === 0 ) {

			this.ids = Viewer.get().getSelection();

		}

		Viewer.get().hide( this.ids );
		this.context.signals.visibilityChanged.dispatch( { action: 'hide', target: this.ids } );

	}

	undo() {

		Viewer.get().show( this.ids );
		this.context.signals.visibilityChanged.dispatch( { action: 'show', target: this.ids } );

	}

}

class ShowSelectionOperator extends Operator {

	static operatorName = 'Viewer.ShowSelected';
	static operatorLabel = 'Show Selection';
	static undoable = true;

	constructor( context, ids ) {

		super( context );
		this.ids = Array.isArray( ids ) ? [ ...ids ] : [];

	}

	execute() {

		if ( this.ids.length === 0 ) {

			this.ids = Viewer.get().getSelection();

		}

		if ( this.ids.length === 0 ) {

			console.warn( 'ShowSelectionOperator: No ids provided' );
			return { status: 'CANCELLED' };

		}

		Viewer.get().show( this.ids );
		this.context.signals.visibilityChanged.dispatch( { action: 'show', target: this.ids } );

	}

	undo() {

		Viewer.get().hide( this.ids );
		this.context.signals.visibilityChanged.dispatch( { action: 'hide', target: this.ids } );

	}

}

class ShowAllOperator extends Operator {

	static operatorName = 'Viewer.ShowAll';
	static operatorLabel = 'Show All';
	static undoable = true;

	constructor( context ) {

		super( context );
		this.ids = [];

	}

	execute() {

		// The hidden set, so undo can restore it exactly.
		if ( this.ids.length === 0 ) {

			this.ids = Viewer.get().getHidden();

		}

		Viewer.get().showAll();
		this.context.signals.visibilityChanged.dispatch( { action: 'showAll' } );

	}

	undo() {

		Viewer.get().hide( this.ids );
		this.context.signals.visibilityChanged.dispatch( { action: 'hide', target: this.ids } );

	}

}

const VIEWS = Object.freeze( {
	FRONT: 0, BACK: 1, LEFT: 2, RIGHT: 3, TOP: 4, BOTTOM: 5,
} );
const NAV_PRESETS = Object.freeze( [ 'blender', 'rhino', 'revit', 'web' ] );

// `run( viewer, context, ...args )` only runs once the viewer exists.
function command( name, label, run, needsArgs = false ) {

	class Command extends Operator {

		static operatorName = name;
		static operatorLabel = label;

		constructor( context, ...args ) {

			super( context );
			this.args = args;

		}

		poll() {

			if ( ! Viewer.get() ) return false;
			if ( needsArgs && this.args.length === 0 ) return false;
			return true;

		}

		execute() {

			return run( Viewer.get(), this.context, ...this.args );

		}

	}

	return Command;

}

const ViewerHideAll = command( 'Viewer.HideAll', 'Hide All', ( viewer, context ) => {

	viewer.hideAll();
	context.signals.visibilityChanged.dispatch( { action: 'hideAll' } );

} );

const ViewerIsolate = command( 'Viewer.IsolateSelected', 'Isolate Selection', ( viewer, context ) => {

	viewer.isolateSelected();
	context.signals.visibilityChanged.dispatch( { action: 'isolate' } );

} );

const MEASURE_MODES = Object.freeze( [ 'length', 'area', 'volume' ] );

function publishMeasure( context ) {

	const state = measure.snapshot();
	context.signals.measureChanged.dispatch( state );
	return state;

}

const ViewerMeasure = command( 'Viewer.Measure', 'Measure', ( viewer, context, mode ) => {

	if ( ! MEASURE_MODES.includes( mode ) ) return { status: 'CANCELLED' };
	const next = measure.mode() === mode ? null : mode;
	measure.setMode( next );
	if ( next === 'volume' ) measure.syncVolume( viewer );
	return publishMeasure( context );

}, true );

const ViewerMeasureClick = command( 'Viewer.AddMeasurePoint', 'Measure Click', async ( viewer, context, click ) => {

	const mode = measure.mode();
	if ( mode !== 'length' && mode !== 'area' ) return { status: 'CANCELLED' };
	const hit = await resolvePick( viewer, click, measure.snapshot().points );
	if ( ! hit?.point ) return { status: 'CANCELLED' };
	measure.add( hit );
	return publishMeasure( context );

}, true );

const ViewerMeasureUndo = command( 'Viewer.UndoMeasurePoint', 'Undo Measure Point', ( viewer, context ) => {

	if ( ! measure.mode() ) return { status: 'CANCELLED' };
	measure.undo();
	return publishMeasure( context );

} );

const ViewerMeasureClear = command( 'Viewer.ClearMeasure', 'Clear Measure', ( viewer, context ) => {

	if ( ! measure.mode() ) return { status: 'CANCELLED' };
	measure.clear();
	return publishMeasure( context );

} );

// The tool flags reach the ribbon through viewerToolsChanged, which the
// viewer's frame callback publishes when one of them changes.
const ViewerXray = command( 'Viewer.ToggleXray', 'Toggle X-ray', ( viewer ) => viewer.toggleXray() );
const ViewerSection = command( 'Viewer.ToggleSection', 'Toggle Section', ( viewer ) => viewer.toggleSection() );
const ViewerClearSection = command( 'Viewer.ClearSection', 'Clear Section Cuts', ( viewer ) => viewer.clearSection() );
const ViewerFly = command( 'Viewer.ToggleFly', 'Toggle Fly', ( viewer ) => viewer.toggleFly() );
const ViewerProjection = command( 'Viewer.ToggleProjection', 'Toggle Orthographic', ( viewer ) => viewer.toggleProjection() );

// A checkbox passes the wanted boolean. A button omits it and flips the flag.
const ViewerGrid = command( 'Viewer.ToggleGrid', 'Toggle Grid', ( viewer, context, on ) => {

	viewer.setGridVisible( typeof on === 'boolean' ? on : ! viewer.gridVisible() );

} );

const ViewerAxes = command( 'Viewer.ToggleAxes', 'Toggle Axes', ( viewer, context, on ) => {

	viewer.setOriginAxesVisible( typeof on === 'boolean' ? on : ! viewer.originAxesVisible() );

} );

const ViewerFogToggle = command( 'Scene.ToggleFog', 'Toggle Fog', ( viewer, context, on ) => {

	viewer.setFogVisible( typeof on === 'boolean' ? on : ! viewer.fogVisible() );
	context.signals.fogChanged.dispatch( viewer.fog() );

} );

const ViewerSelectionOutline = command( 'Viewer.ToggleSelectionOutline', 'Toggle Selection Outline', ( viewer, context, on ) => {

	viewer.setSelectionOutline( typeof on === 'boolean' ? on : ! viewer.selectionOutlineEnabled() );

} );

const ViewerClearColors = command( 'Viewer.ClearColors', 'Clear Colors', ( viewer, context ) => {

	viewer.clearColors();
	context.signals.colorsChanged.dispatch( { action: 'clear' } );

} );

const ViewerClearSelection = command( 'Viewer.ClearSelection', 'Clear Selection', ( viewer, context ) => {

	viewer.clearSelection();
	context.signals.selectionCleared.dispatch();

} );

const ViewerViewAll = command( 'Viewer.ViewAll', 'View All', ( viewer ) => viewer.viewAll() );
const ViewerFrameSelection = command( 'Viewer.FrameSelection', 'Frame Selection', ( viewer ) => viewer.frameSelection() );

const ViewerStandardView = command( 'Viewer.SetStandardView', 'Standard View', ( viewer, context, view ) => {

	const id = typeof view === 'number' ? view : VIEWS[ view ];
	if ( id == null ) return { status: 'CANCELLED' };
	viewer.setStandardView( id );
	context.signals.standardViewSet.dispatch( { id } );

}, true );

const ViewerNavPreset = command( 'Viewer.SetNavPreset', 'Navigation Preset', ( viewer, context, preset ) => {

	if ( ! NAV_PRESETS.includes( preset ) ) return { status: 'CANCELLED' };
	viewer.setNavPreset( preset );
	context.signals.navPresetChanged.dispatch( { preset } );

}, true );

const ViewerSetSelection = command( 'Viewer.SetSelection', 'Set Selection', ( viewer, context, ids ) => viewer.setSelection( ids ), true );
const ViewerAddToSelection = command( 'Viewer.AddToSelection', 'Add To Selection', ( viewer, context, ids ) => viewer.addToSelection( ids ), true );
const ViewerRemoveFromSelection = command( 'Viewer.RemoveFromSelection', 'Remove From Selection', ( viewer, context, ids ) => viewer.removeFromSelection( ids ), true );

const ViewerSelectGlobalId = command( 'Viewer.SelectGlobalId', 'Select GlobalId', async ( viewer, context, guid ) => {

	const id = String( guid ?? '' ).trim();
	if ( ! id ) return { status: 'CANCELLED' };

	try {

		await viewer.getObjects();
		viewer.show( id );
		viewer.setSelection( id );
		viewer.frameSelection();
		context.signals.visibilityChanged.dispatch( { action: 'show', target: viewer.getSelection() } );

	} catch ( error ) {

		const message = error?.message || 'No element with that GlobalId';
		console.warn( 'Select GlobalId:', message );
		return { status: 'CANCELLED', message };

	}

}, true );

const ViewerSetVisible = command( 'Viewer.SetVisible', 'Set Visible', ( viewer, context, ids, on ) => {

	viewer.setVisible( ids, on );
	context.signals.visibilityChanged.dispatch( { action: 'setVisible', target: ids } );

}, true );

const ViewerShow = command( 'Viewer.Show', 'Show', ( viewer, context, ids ) => {

	viewer.show( ids );
	context.signals.visibilityChanged.dispatch( { action: 'show', target: ids } );

}, true );

const ViewerHide = command( 'Viewer.Hide', 'Hide', ( viewer, context, ids ) => {

	viewer.hide( ids );
	context.signals.visibilityChanged.dispatch( { action: 'hide', target: ids } );

}, true );

const ViewerSetColor = command( 'Viewer.SetColor', 'Set Color', ( viewer, context, ids, color ) => {

	viewer.setColor( ids, color );
	context.signals.colorsChanged.dispatch( { action: 'set', target: ids, color } );

}, true );

const ViewerSetBackground = command( 'Scene.SetBackground', 'Set Background', ( viewer, context, color ) => {

	Scene.setBackground( color );
	context.signals.backgroundChanged.dispatch( { color } );

}, true );

const ViewerSetFog = command( 'Scene.SetFog', 'Set Fog', ( viewer, context, options ) => {

	const fog = viewer.setFog( options );
	context.signals.fogChanged.dispatch( fog );
	return fog;

}, true );

const ViewerSetCamera = command( 'Viewer.SetCamera', 'Set Camera', ( viewer, context, state ) => {

	viewer.setCamera( state );
	context.signals.cameraChanged.dispatch( state );

}, true );

const ViewerSetFederationUnit = command( 'Scene.SetFederationUnit', 'Set Federation Unit', ( viewer, context, unit ) => Scene.setUnit( unit ), true );
const ViewerSetFalseOrigin = command( 'Scene.SetFalseOrigin', 'Set False Origin', ( viewer, context, origin ) => Scene.setFalseOrigin( origin ), true );
const ViewerSetModelTransform = command( 'Scene.SetModelTransform', 'Set Model Transform', ( viewer, context, sourceId, transform ) => Scene.setModelTransform( sourceId, transform ), true );
const ViewerClearModelTransform = command( 'Scene.ClearModelTransform', 'Clear Model Transform', ( viewer, context, sourceId ) => Scene.setModelTransform( sourceId, null ), true );

// Render modes and their tuning. Each needs a viewer build that has them;
// an older one cancels with a warning instead of throwing.
const RENDER_MODES = Object.freeze( [ 'shaded', 'shadedEdges', 'technical', 'clay', 'xray' ] );

function renderCommand( name, label, method, check ) {

	return command( name, label, ( viewer, context, value ) => {

		if ( typeof viewer[ method ] !== 'function' ) {

			log.warn( `${ name }: this viewer build has no ${ method }(); it needs a newer @aeco-dev/viewer` );
			return { status: 'CANCELLED' };

		}

		if ( check && ! check( value ) ) return { status: 'CANCELLED' };
		viewer[ method ]( value );

	}, true );

}

// 'shaded' | 'shadedEdges' | 'technical' | 'clay' | 'xray'.
const ViewerRenderMode = command( 'Viewer.SetRenderMode', 'Render Mode', ( viewer, context, mode ) => {

	if ( typeof viewer.setRenderMode !== 'function' ) {

		log.warn( 'Viewer.SetRenderMode: this viewer build has no setRenderMode(); it needs a newer @aeco-dev/viewer' );
		return { status: 'CANCELLED' };

	}

	if ( ! RENDER_MODES.includes( mode ) ) return { status: 'CANCELLED' };
	viewer.setRenderMode( mode );
	context.signals.renderModeChanged.dispatch( { mode } );

}, true );
// Partial settings objects, as viewer.setShading / setEdges / setAmbientOcclusion take.
const ViewerShading = renderCommand( 'Viewer.SetShading', 'Set Shading', 'setShading' );
const ViewerEdges = renderCommand( 'Viewer.SetEdges', 'Set Edges', 'setEdges' );
const ViewerAmbientOcclusion = renderCommand( 'Viewer.SetAmbientOcclusion', 'Set Ambient Occlusion', 'setAmbientOcclusion' );
// true / false: smooth the feature lines (on by default).
const ViewerEdgeAntialias = command( 'Viewer.SetEdgeAntialias', 'Smooth Lines', ( viewer, context, on ) => {

	if ( typeof viewer.setEdges !== 'function' ) return { status: 'CANCELLED' };
	viewer.setEdges( { antialias: !! on } );

}, true );

// Snapshot size presets and the ribbon's current choice. Viewer.Snapshot uses
// these when it is called without options.
const SNAPSHOT_SIZES = Object.freeze( {
	viewport: {},
	viewport2x: { scale: 2 },
	hd: { width: 1920, height: 1080 },
	uhd: { width: 3840, height: 2160 },
	uhd8k: { width: 7680, height: 4320 },
} );
const snapshotPrefs = { size: 'viewport', transparent: false };

const ViewerSnapshotSize = command( 'Viewer.SetSnapshotSize', 'Snapshot Size', ( viewer, context, size ) => {

	if ( ! Object.hasOwn( SNAPSHOT_SIZES, size ) ) return { status: 'CANCELLED' };
	snapshotPrefs.size = size;

}, true );

const ViewerSnapshotTransparent = command( 'Viewer.SetSnapshotTransparent', 'Transparent Snapshot', ( viewer, context, on ) => {

	snapshotPrefs.transparent = !! on;

}, true );

// Render the view offscreen and download it. `options` go to viewer.snapshot
// (width, height, scale, transparent, background, type, quality, timeoutMs);
// without them the ribbon's size and transparency apply. `download: false`
// skips the download. Resolves to the image Blob.
const ViewerSnapshot = command( 'Viewer.Snapshot', 'Snapshot', async ( viewer, context, options ) => {

	if ( typeof viewer.snapshot !== 'function' ) {

		log.warn( 'Viewer.Snapshot: this viewer build has no snapshot(); it needs a newer @aeco-dev/viewer' );
		return { status: 'CANCELLED' };

	}

	const { download = true, ...rest } = options ?? {
		...SNAPSHOT_SIZES[ snapshotPrefs.size ],
		transparent: snapshotPrefs.transparent,
	};
	const blob = await viewer.snapshot( rest );
	if ( download ) {

		const stamp = new Date().toISOString().slice( 0, 19 ).replace( /[-:]/g, '' ).replace( 'T', '-' );
		const ext = ( blob.type.split( '/' )[ 1 ] || 'png' ).replace( 'jpeg', 'jpg' );
		const anchor = document.createElement( 'a' );
		const url = URL.createObjectURL( blob );
		anchor.href = url;
		anchor.download = `snapshot-${ stamp }.${ ext }`;
		anchor.click();
		setTimeout( () => URL.revokeObjectURL( url ), 0 );

	}

	return blob;

} );

// Argument hints for the terminal's command bar (see Operator.operatorArgs).
const ON = { name: 'on', type: 'boolean', optional: true };
const IDS = { name: 'ids', type: 'ids' };
const SETTINGS = { name: 'settings', type: 'object' };
const COMMAND_ARGS = {
	'Viewer.HideSelected': [ { ...IDS, optional: true } ],
	'Viewer.ShowSelected': [ { ...IDS, optional: true } ],
	'Viewer.ToggleGrid': [ ON ],
	'Viewer.ToggleAxes': [ ON ],
	'Scene.ToggleFog': [ ON ],
	'Viewer.ToggleSelectionOutline': [ ON ],
	'Viewer.SetStandardView': [ { name: 'view', type: 'enum', options: Object.keys( VIEWS ) } ],
	'Viewer.SetNavPreset': [ { name: 'preset', type: 'enum', options: NAV_PRESETS } ],
	'Viewer.SetSelection': [ IDS ],
	'Viewer.AddToSelection': [ IDS ],
	'Viewer.RemoveFromSelection': [ IDS ],
	'Viewer.SelectGlobalId': [ { name: 'guid', type: 'string' } ],
	'Viewer.SetVisible': [ IDS, { name: 'on', type: 'boolean' } ],
	'Viewer.Show': [ IDS ],
	'Viewer.Hide': [ IDS ],
	'Viewer.SetColor': [ IDS, { name: 'color', type: 'color' } ],
	'Scene.SetBackground': [ { name: 'color', type: 'color' } ],
	'Scene.SetFog': [ { name: 'options', type: 'object' } ],
	'Viewer.SetCamera': [ { name: 'state', type: 'object' } ],
	'Scene.SetFederationUnit': [ { name: 'unit', type: 'string' } ],
	'Scene.SetFalseOrigin': [ { name: 'origin', type: 'object' } ],
	'Scene.SetModelTransform': [ { name: 'sourceId', type: 'number' }, { name: 'transform', type: 'object' } ],
	'Scene.ClearModelTransform': [ { name: 'sourceId', type: 'number' } ],
	'Viewer.Measure': [ { name: 'mode', type: 'enum', options: MEASURE_MODES } ],
	'Viewer.SetRenderMode': [ { name: 'mode', type: 'enum', options: RENDER_MODES } ],
	'Viewer.SetShading': [ SETTINGS ],
	'Viewer.SetEdges': [ SETTINGS ],
	'Viewer.SetAmbientOcclusion': [ SETTINGS ],
	'Viewer.SetEdgeAntialias': [ { name: 'on', type: 'boolean' } ],
	'Viewer.Snapshot': [ { name: 'options', type: 'object', optional: true } ],
	'Viewer.SetSnapshotSize': [ { name: 'size', type: 'enum', options: Object.keys( SNAPSHOT_SIZES ) } ],
	'Viewer.SetSnapshotTransparent': [ { name: 'on', type: 'boolean' } ],
};

const operators = [
	HideSelectionOperator,
	ShowSelectionOperator,
	ShowAllOperator,
	ViewerHideAll,
	ViewerIsolate,
	ViewerXray,
	ViewerSection,
	ViewerClearSection,
	ViewerFly,
	ViewerProjection,
	ViewerGrid,
	ViewerAxes,
	ViewerFogToggle,
	ViewerClearColors,
	ViewerSelectionOutline,
	ViewerClearSelection,
	ViewerViewAll,
	ViewerFrameSelection,
	ViewerStandardView,
	ViewerNavPreset,
	ViewerSetSelection,
	ViewerSelectGlobalId,
	ViewerAddToSelection,
	ViewerRemoveFromSelection,
	ViewerSetVisible,
	ViewerShow,
	ViewerHide,
	ViewerSetColor,
	ViewerSetBackground,
	ViewerSetFog,
	ViewerSetCamera,
	ViewerSetFederationUnit,
	ViewerSetFalseOrigin,
	ViewerSetModelTransform,
	ViewerClearModelTransform,
	ViewerMeasure,
	ViewerMeasureClick,
	ViewerMeasureUndo,
	ViewerMeasureClear,
	ViewerRenderMode,
	ViewerShading,
	ViewerEdges,
	ViewerAmbientOcclusion,
	ViewerEdgeAntialias,
	ViewerSnapshot,
	ViewerSnapshotSize,
	ViewerSnapshotTransparent,
];

for ( const OperatorClass of operators ) {

	const args = COMMAND_ARGS[ OperatorClass.operatorName ];
	if ( args ) OperatorClass.operatorArgs = args;

}

export { HideSelectionOperator, ShowAllOperator, ShowSelectionOperator };

export default operators;
