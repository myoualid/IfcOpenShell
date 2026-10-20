import { Operator } from '../../ops.js';
import { Viewer, viewer } from '../../tool/Viewer.js';

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

			this.ids = [ ...viewer.getSelection() ];

		}

		viewer.hide( this.ids );
		this.context.signals.visibilityChanged.dispatch( { action: 'hide', target: this.ids } );

	}

	undo() {

		viewer.show( this.ids );
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

			this.ids = [ ...viewer.getSelection() ];

		}

		if ( this.ids.length === 0 ) {

			console.warn( 'ShowSelectionOperator: No ids provided' );
			return { status: 'CANCELLED' };

		}

		viewer.show( this.ids );
		this.context.signals.visibilityChanged.dispatch( { action: 'show', target: this.ids } );

	}

	undo() {

		viewer.hide( this.ids );
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

			this.ids = [ ...viewer.getHidden() ];

		}

		viewer.showAll();
		this.context.signals.visibilityChanged.dispatch( { action: 'showAll' } );

	}

	undo() {

		viewer.hide( this.ids );
		this.context.signals.visibilityChanged.dispatch( { action: 'hide', target: this.ids } );

	}

}

const VIEWS = Object.freeze( {
	FRONT: 0, BACK: 1, LEFT: 2, RIGHT: 3, TOP: 4, BOTTOM: 5,
} );
const NAV_PRESETS = Object.freeze( [ 'blender', 'rhino', 'revit', 'web' ] );

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

			return run( this.context, ...this.args );

		}

	}

	return Command;

}

const ViewerHideAll = command( 'viewer.hide_all', 'Hide All', ( context ) => {

	viewer.hideAll();
	context.signals.visibilityChanged.dispatch( { action: 'hideAll' } );

} );

const ViewerIsolate = command( 'viewer.isolate', 'Isolate Selection', ( context ) => {

	viewer.isolateSelected();
	context.signals.visibilityChanged.dispatch( { action: 'isolate' } );

} );

const ViewerXray = command( 'viewer.xray', 'Toggle X-ray', ( context ) => {

	viewer.toggleXray();
	context.signals.xrayToggled.dispatch( { active: viewer.xrayActive() } );

} );

const ViewerClearColors = command( 'viewer.clear_colors', 'Clear Colors', ( context ) => {

	viewer.clearColors();
	context.signals.colorsChanged.dispatch( { action: 'clear' } );

} );

const ViewerSelectionOutline = command( 'viewer.selection_outline', 'Toggle Selection Outline', () => {

	const on = ! viewer.selectionOutlineEnabled();
	viewer.setSelectionOutline( on );

} );

const ViewerClearSelection = command( 'viewer.clear_selection', 'Clear Selection', ( context ) => {

	viewer.clearSelection();
	context.signals.selectionCleared.dispatch();

} );

const ViewerViewAll = command( 'viewer.view_all', 'View All', () => {

	viewer.viewAll();

} );

const ViewerFrameSelection = command( 'viewer.frame_selection', 'Frame Selection', () => {

	viewer.frameSelection();

} );

const ViewerStandardView = command( 'viewer.standard_view', 'Standard View', ( context, view ) => {

	const id = typeof view === 'number' ? view : VIEWS[ view ];
	if ( id == null ) return { status: 'CANCELLED' };
	viewer.setStandardView( id );
	context.signals.standardViewSet.dispatch( { id } );

}, true );

const ViewerNavPreset = command( 'viewer.nav_preset', 'Navigation Preset', ( context, preset ) => {

	if ( ! NAV_PRESETS.includes( preset ) ) return { status: 'CANCELLED' };
	viewer.setNavPreset( preset );
	context.signals.navPresetChanged.dispatch( { preset } );

}, true );

const ViewerSetSelection = command( 'viewer.set_selection', 'Set Selection', ( _context, ids ) => {

	viewer.setSelection( ids );

}, true );

const ViewerAddToSelection = command( 'viewer.add_to_selection', 'Add To Selection', ( _context, ids ) => {

	viewer.addToSelection( ids );

}, true );

const ViewerRemoveFromSelection = command( 'viewer.remove_from_selection', 'Remove From Selection', ( _context, ids ) => {

	viewer.removeFromSelection( ids );

}, true );

const ViewerSetVisible = command( 'viewer.set_visible', 'Set Visible', ( context, ids, on ) => {

	viewer.setVisible( ids, on );
	context.signals.visibilityChanged.dispatch( { action: 'setVisible', target: ids } );

}, true );

const ViewerShow = command( 'viewer.show', 'Show', ( context, ids ) => {

	viewer.show( ids );
	context.signals.visibilityChanged.dispatch( { action: 'show', target: ids } );

}, true );

const ViewerHide = command( 'viewer.hide', 'Hide', ( context, ids ) => {

	viewer.hide( ids );
	context.signals.visibilityChanged.dispatch( { action: 'hide', target: ids } );

}, true );

const ViewerSetColor = command( 'viewer.set_color', 'Set Color', ( context, ids, color ) => {

	viewer.setColor( ids, color );
	context.signals.colorsChanged.dispatch( { action: 'set', target: ids, color } );

}, true );

const ViewerSetBackground = command( 'viewer.set_background', 'Set Background', ( context, color ) => {

	viewer.setBackground( color );
	context.signals.backgroundChanged.dispatch( { color } );

}, true );

const ViewerSetFog = command( 'viewer.set_fog', 'Set Fog', ( context, options ) => {

	const fog = viewer.setFog( options );
	context.signals.fogChanged.dispatch( fog );
	return fog;

}, true );

const ViewerSetCamera = command( 'viewer.set_camera', 'Set Camera', ( context, state ) => {

	viewer.setCamera( state );
	context.signals.cameraChanged.dispatch( state );

}, true );

const ViewerSetFederationUnit = command( 'viewer.set_federation_unit', 'Set Federation Unit', ( _context, unit ) => {

	viewer.setFederationUnit( unit );

}, true );

const ViewerSetFalseOrigin = command( 'viewer.set_false_origin', 'Set False Origin', ( _context, origin ) => {

	viewer.setFalseOrigin( origin );

}, true );

const ViewerSetModelTransform = command( 'viewer.set_model_transform', 'Set Model Transform', ( _context, sourceId, transform ) => {

	viewer.setModelTransform( sourceId, transform );

}, true );

const ViewerClearModelTransform = command( 'viewer.clear_model_transform', 'Clear Model Transform', ( _context, sourceId ) => {

	viewer.clearModelTransform( sourceId );

}, true );

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

		const row = viewer.getSelectedObjects().find( ( item ) => item.objectId === objectId );
		return !! row && ( 'guid' in row || 'name' in row || 'type' in row );

	} catch {

		return false;

	}

}

async function publishBoxSelection( context, ids, serial, generation ) {

	const stale = () => serial !== viewportPickSerial || generation !== boxGeneration;

	if ( ! ids?.length ) {

		if ( stale() ) return;
		context.store.selection = null;
		context.signals.objectPicked.dispatch( null );
		return;

	}

	try {

		await viewer.getObjects();

	} catch { /* element table is not resident yet */ }

	if ( stale() ) return;
	const activeId = viewer.getActiveObject() || ids[ 0 ];
	const pick = viewer.getSelectedObjects().find( ( row ) => row.objectId === activeId )
		?? { objectId: activeId };
	context.store.selection = pick;
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

				await viewer.getObjects();

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

		const ids = this.ids ?? viewer.getSelection();
		this.context.signals.selectionChanged.dispatch( { ids } );
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
	ViewerClearColors,
	ViewerSelectionOutline,
	ViewerClearSelection,
	ViewerViewAll,
	ViewerFrameSelection,
	ViewerStandardView,
	ViewerNavPreset,
	ViewerSetSelection,
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
	ViewerObjectPicked,
	ViewerSelectionChanged,
];
