import { Operator } from '../../ops.js';
import { measure, resolvePick } from '../../tool/measure.js';
import { Scene } from '../../tool/Scene.js';
import { Viewer } from '../../tool/Viewer.js';

// Undoable visibility commands capture their ids on the first execute, so
// redo (execute again) reuses them.

class HideSelectionOperator extends Operator {

	static operatorName = 'hide.selection';
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

	static operatorName = 'show.selection';
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

	static operatorName = 'show.all';
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

const ViewerHideAll = command( 'viewer.hide_all', 'Hide All', ( viewer, context ) => {

	viewer.hideAll();
	context.signals.visibilityChanged.dispatch( { action: 'hideAll' } );

} );

const ViewerIsolate = command( 'viewer.isolate', 'Isolate Selection', ( viewer, context ) => {

	viewer.isolateSelected();
	context.signals.visibilityChanged.dispatch( { action: 'isolate' } );

} );

const MEASURE_MODES = Object.freeze( [ 'length', 'area', 'volume' ] );

function publishMeasure( context ) {

	const state = measure.snapshot();
	context.signals.measureChanged.dispatch( state );
	return state;

}

const ViewerMeasure = command( 'viewer.measure', 'Measure', ( viewer, context, mode ) => {

	if ( ! MEASURE_MODES.includes( mode ) ) return { status: 'CANCELLED' };
	const next = measure.mode() === mode ? null : mode;
	measure.setMode( next );
	if ( next === 'volume' ) measure.syncVolume( viewer );
	return publishMeasure( context );

}, true );

const ViewerMeasureClick = command( 'viewer.measure_click', 'Measure Click', async ( viewer, context, click ) => {

	const mode = measure.mode();
	if ( mode !== 'length' && mode !== 'area' ) return { status: 'CANCELLED' };
	const hit = await resolvePick( viewer, click, measure.snapshot().points );
	if ( ! hit?.point ) return { status: 'CANCELLED' };
	measure.add( hit );
	return publishMeasure( context );

}, true );

const ViewerMeasureUndo = command( 'viewer.measure_undo', 'Undo Measure Point', ( viewer, context ) => {

	if ( ! measure.mode() ) return { status: 'CANCELLED' };
	measure.undo();
	return publishMeasure( context );

} );

const ViewerMeasureClear = command( 'viewer.measure_clear', 'Clear Measure', ( viewer, context ) => {

	if ( ! measure.mode() ) return { status: 'CANCELLED' };
	measure.clear();
	return publishMeasure( context );

} );

// The tool flags reach the ribbon through viewerToolsChanged, which the
// viewer's frame callback publishes when one of them changes.
const ViewerXray = command( 'viewer.xray', 'Toggle X-ray', ( viewer ) => viewer.toggleXray() );
const ViewerSection = command( 'viewer.section', 'Toggle Section', ( viewer ) => viewer.toggleSection() );
const ViewerClearSection = command( 'viewer.clear_section', 'Clear Section Cuts', ( viewer ) => viewer.clearSection() );
const ViewerFly = command( 'viewer.fly', 'Toggle Fly', ( viewer ) => viewer.toggleFly() );
const ViewerProjection = command( 'viewer.projection', 'Toggle Orthographic', ( viewer ) => viewer.toggleProjection() );

// A checkbox passes the wanted boolean. A button omits it and flips the flag.
const ViewerGrid = command( 'viewer.grid', 'Toggle Grid', ( viewer, context, on ) => {

	viewer.setGridVisible( typeof on === 'boolean' ? on : ! viewer.gridVisible() );

} );

const ViewerAxes = command( 'viewer.axes', 'Toggle Axes', ( viewer, context, on ) => {

	viewer.setOriginAxesVisible( typeof on === 'boolean' ? on : ! viewer.originAxesVisible() );

} );

const ViewerFogToggle = command( 'viewer.fog_toggle', 'Toggle Fog', ( viewer, context, on ) => {

	viewer.setFogVisible( typeof on === 'boolean' ? on : ! viewer.fogVisible() );
	context.signals.fogChanged.dispatch( viewer.fog() );

} );

const ViewerSelectionOutline = command( 'viewer.selection_outline', 'Toggle Selection Outline', ( viewer, context, on ) => {

	viewer.setSelectionOutline( typeof on === 'boolean' ? on : ! viewer.selectionOutlineEnabled() );

} );

const ViewerClearColors = command( 'viewer.clear_colors', 'Clear Colors', ( viewer, context ) => {

	viewer.clearColors();
	context.signals.colorsChanged.dispatch( { action: 'clear' } );

} );

const ViewerClearSelection = command( 'viewer.clear_selection', 'Clear Selection', ( viewer, context ) => {

	viewer.clearSelection();
	context.signals.selectionCleared.dispatch();

} );

const ViewerViewAll = command( 'viewer.view_all', 'View All', ( viewer ) => viewer.viewAll() );
const ViewerFrameSelection = command( 'viewer.frame_selection', 'Frame Selection', ( viewer ) => viewer.frameSelection() );

const ViewerStandardView = command( 'viewer.standard_view', 'Standard View', ( viewer, context, view ) => {

	const id = typeof view === 'number' ? view : VIEWS[ view ];
	if ( id == null ) return { status: 'CANCELLED' };
	viewer.setStandardView( id );
	context.signals.standardViewSet.dispatch( { id } );

}, true );

const ViewerNavPreset = command( 'viewer.nav_preset', 'Navigation Preset', ( viewer, context, preset ) => {

	if ( ! NAV_PRESETS.includes( preset ) ) return { status: 'CANCELLED' };
	viewer.setNavPreset( preset );
	context.signals.navPresetChanged.dispatch( { preset } );

}, true );

const ViewerSetSelection = command( 'viewer.set_selection', 'Set Selection', ( viewer, context, ids ) => viewer.setSelection( ids ), true );
const ViewerAddToSelection = command( 'viewer.add_to_selection', 'Add To Selection', ( viewer, context, ids ) => viewer.addToSelection( ids ), true );
const ViewerRemoveFromSelection = command( 'viewer.remove_from_selection', 'Remove From Selection', ( viewer, context, ids ) => viewer.removeFromSelection( ids ), true );

const ViewerSelectGlobalId = command( 'viewer.select_global_id', 'Select GlobalId', async ( viewer, context, guid ) => {

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

const ViewerSetVisible = command( 'viewer.set_visible', 'Set Visible', ( viewer, context, ids, on ) => {

	viewer.setVisible( ids, on );
	context.signals.visibilityChanged.dispatch( { action: 'setVisible', target: ids } );

}, true );

const ViewerShow = command( 'viewer.show', 'Show', ( viewer, context, ids ) => {

	viewer.show( ids );
	context.signals.visibilityChanged.dispatch( { action: 'show', target: ids } );

}, true );

const ViewerHide = command( 'viewer.hide', 'Hide', ( viewer, context, ids ) => {

	viewer.hide( ids );
	context.signals.visibilityChanged.dispatch( { action: 'hide', target: ids } );

}, true );

const ViewerSetColor = command( 'viewer.set_color', 'Set Color', ( viewer, context, ids, color ) => {

	viewer.setColor( ids, color );
	context.signals.colorsChanged.dispatch( { action: 'set', target: ids, color } );

}, true );

const ViewerSetBackground = command( 'viewer.set_background', 'Set Background', ( viewer, context, color ) => {

	Scene.setBackground( color );
	context.signals.backgroundChanged.dispatch( { color } );

}, true );

const ViewerSetFog = command( 'viewer.set_fog', 'Set Fog', ( viewer, context, options ) => {

	const fog = viewer.setFog( options );
	context.signals.fogChanged.dispatch( fog );
	return fog;

}, true );

const ViewerSetCamera = command( 'viewer.set_camera', 'Set Camera', ( viewer, context, state ) => {

	viewer.setCamera( state );
	context.signals.cameraChanged.dispatch( state );

}, true );

const ViewerSetFederationUnit = command( 'viewer.set_federation_unit', 'Set Federation Unit', ( viewer, context, unit ) => Scene.setUnit( unit ), true );
const ViewerSetFalseOrigin = command( 'viewer.set_false_origin', 'Set False Origin', ( viewer, context, origin ) => Scene.setFalseOrigin( origin ), true );
const ViewerSetModelTransform = command( 'viewer.set_model_transform', 'Set Model Transform', ( viewer, context, sourceId, transform ) => Scene.setModelTransform( sourceId, transform ), true );
const ViewerClearModelTransform = command( 'viewer.clear_model_transform', 'Clear Model Transform', ( viewer, context, sourceId ) => Scene.setModelTransform( sourceId, null ), true );

// Clicks can overlap. A slower getObjects() for an earlier pick must not
// publish after a later one.
let pickGeneration = 0;
// A click runs selection_changed, then object_picked, in the same turn.
// A marquee only runs selection_changed. The serial lets the box-select
// path publish a pick without repeating the click path.
let viewportPickSerial = 0;
let boxGeneration = 0;

// A loaded v19 element row has guid/name/type. Before getObjects(), the
// selection read is only {objectId}.
function elementTableHas( objectId ) {

	try {

		const row = Viewer.get().getSelectedObjects().find( ( item ) => item.objectId === objectId );
		return !! row && ( 'guid' in row || 'name' in row || 'type' in row );

	} catch {

		return false;

	}

}

async function publishBoxSelection( context, ids, serial, generation ) {

	const stale = () => serial !== viewportPickSerial || generation !== boxGeneration;

	if ( ! ids?.length ) {

		if ( stale() ) return;
		context.signals.objectPicked.dispatch( null );
		return;

	}

	const viewer = Viewer.get();
	try {

		await viewer.getObjects();

	} catch { /* element table is not resident yet */ }

	if ( stale() ) return;
	const activeId = viewer.getActiveObject() || ids[ 0 ];
	const pick = viewer.getSelectedObjects().find( ( row ) => row.objectId === activeId )
		?? { objectId: activeId };
	context.signals.objectPicked.dispatch( pick );

}

class ViewerObjectPicked extends Operator {

	static operatorName = 'viewer.object_picked';
	static operatorLabel = 'Object Picked';

	constructor( context, pick ) {

		super( context );
		this.pick = pick;

	}

	// The click payload is {objectId, guid, modelIndex, sourceId}. Name and
	// IFC class live on the v19 element table, and getSelectedObjects() only
	// has them after getObjects() — the same order as the scripting example.
	async execute() {

		viewportPickSerial ++;
		const generation = ++ pickGeneration;
		if ( this.pick?.objectId && ! elementTableHas( this.pick.objectId ) ) {

			try {

				await Viewer.get().getObjects();

			} catch { /* element table is not resident yet */ }

		}

		if ( generation !== pickGeneration ) return { status: 'FINISHED' };
		this.context.signals.objectPicked.dispatch( this.pick );
		return { status: 'FINISHED' };

	}

}

class ViewerSelectionChanged extends Operator {

	static operatorName = 'viewer.selection_changed';
	static operatorLabel = 'Selection Changed';

	constructor( context, ids ) {

		super( context );
		this.ids = ids;

	}

	execute() {

		const ids = this.ids ?? Viewer.get().getSelection();
		this.context.signals.selectionChanged.dispatch( { ids } );
		if ( measure.mode() === 'volume' ) {

			measure.syncVolume( Viewer.get(), ids );
			publishMeasure( this.context );

		}
		const serial = viewportPickSerial;
		const generation = ++ boxGeneration;
		queueMicrotask( () => {

			if ( serial !== viewportPickSerial ) return;
			void publishBoxSelection( this.context, ids, serial, generation );

		} );
		return { status: 'FINISHED' };

	}

}

export { HideSelectionOperator, ShowAllOperator, ShowSelectionOperator, ViewerObjectPicked, ViewerSelectionChanged };

export default [
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
	ViewerObjectPicked,
	ViewerSelectionChanged,
];
