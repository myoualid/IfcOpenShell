import { Operator } from '../../ops/Operator.js';
import { HideSelectionOperator } from './HideSelectionOperator.js';
import { ShowAllOperator } from './ShowAllOperator.js';
import { ShowSelectionOperator } from './ShowOperator.js';
import { Camera, Controls, Scene } from '../../tool/index.js';

function command( name, label, run, needsArgs = false ) {

	class Command extends Operator {

		static operatorName = name;
		static operatorLabel = label;

		constructor( context, ...args ) {

			super( context );
			this.args = args;

		}

		poll() {

			if ( ! this.context.viewer ) return false;
			if ( needsArgs && this.args.length === 0 ) return false;
			return true;

		}

		execute() {

			return run( this.context, ...this.args );

		}

	}

	return Command;

}

const ViewerHideAll = command( 'viewer.hide_all', 'Hide All', ( bonsai ) => {

	Scene.hideAll();
	bonsai.signals.visibilityChanged.dispatch( { action: 'hideAll' } );

} );

const ViewerIsolate = command( 'viewer.isolate', 'Isolate Selection', ( bonsai ) => {

	Scene.isolateSelected();
	bonsai.signals.visibilityChanged.dispatch( { action: 'isolate' } );

} );

const ViewerXray = command( 'viewer.xray', 'Toggle X-ray', ( bonsai ) => {

	Scene.toggleXray();
	bonsai.signals.xrayToggled.dispatch( { active: Scene.xrayActive() } );

} );

const ViewerClearColors = command( 'viewer.clear_colors', 'Clear Colors', ( bonsai ) => {

	Scene.clearColors();
	bonsai.signals.colorsChanged.dispatch( { action: 'clear' } );

} );

const ViewerSelectionOutline = command( 'viewer.selection_outline', 'Toggle Selection Outline', ( bonsai ) => {

	const on = ! Scene.selectionOutlineEnabled();
	Scene.setSelectionOutline( on );

} );

const ViewerClearSelection = command( 'viewer.clear_selection', 'Clear Selection', ( bonsai ) => {

	Scene.clearSelection();
	bonsai.signals.selectionCleared.dispatch();

} );

const ViewerViewAll = command( 'viewer.view_all', 'View All', () => {

	Camera.viewAll();

} );

const ViewerFrameSelection = command( 'viewer.frame_selection', 'Frame Selection', () => {

	Camera.frameSelection();

} );

const ViewerStandardView = command( 'viewer.standard_view', 'Standard View', ( bonsai, view ) => {

	const id = typeof view === 'number' ? view : Camera.VIEWS[ view ];
	if ( id == null ) return { status: 'CANCELLED' };
	Camera.standardView( id );
	bonsai.signals.standardViewSet.dispatch( { id } );

}, true );

const ViewerNavPreset = command( 'viewer.nav_preset', 'Navigation Preset', ( bonsai, preset ) => {

	if ( ! Controls.NAV_PRESETS.includes( preset ) ) return { status: 'CANCELLED' };
	Controls.setNavPreset( preset );
	bonsai.signals.navPresetChanged.dispatch( { preset } );

}, true );

const ViewerSetSelection = command( 'viewer.set_selection', 'Set Selection', ( _bonsai, ids ) => {

	Scene.setSelection( ids );

}, true );

const ViewerAddToSelection = command( 'viewer.add_to_selection', 'Add To Selection', ( _bonsai, ids ) => {

	Scene.addToSelection( ids );

}, true );

const ViewerRemoveFromSelection = command( 'viewer.remove_from_selection', 'Remove From Selection', ( _bonsai, ids ) => {

	Scene.removeFromSelection( ids );

}, true );

const ViewerSetVisible = command( 'viewer.set_visible', 'Set Visible', ( bonsai, ids, on ) => {

	Scene.setVisible( ids, on );
	bonsai.signals.visibilityChanged.dispatch( { action: 'setVisible', target: ids } );

}, true );

const ViewerShow = command( 'viewer.show', 'Show', ( bonsai, ids ) => {

	Scene.show( ids );
	bonsai.signals.visibilityChanged.dispatch( { action: 'show', target: ids } );

}, true );

const ViewerHide = command( 'viewer.hide', 'Hide', ( bonsai, ids ) => {

	Scene.hide( ids );
	bonsai.signals.visibilityChanged.dispatch( { action: 'hide', target: ids } );

}, true );

const ViewerSetColor = command( 'viewer.set_color', 'Set Color', ( bonsai, ids, color ) => {

	Scene.setColor( ids, color );
	bonsai.signals.colorsChanged.dispatch( { action: 'set', target: ids, color } );

}, true );

const ViewerSetBackground = command( 'viewer.set_background', 'Set Background', ( bonsai, color ) => {

	Scene.setBackground( color );
	bonsai.signals.backgroundChanged.dispatch( { color } );

}, true );

const ViewerSetCamera = command( 'viewer.set_camera', 'Set Camera', ( bonsai, state ) => {

	Camera.set( state );
	bonsai.signals.cameraChanged.dispatch( state );

}, true );

const ViewerSetFederationUnit = command( 'viewer.set_federation_unit', 'Set Federation Unit', ( _bonsai, unit ) => {

	Scene.setFederationUnit( unit );

}, true );

const ViewerSetFalseOrigin = command( 'viewer.set_false_origin', 'Set False Origin', ( _bonsai, origin ) => {

	Scene.setFalseOrigin( origin );

}, true );

const ViewerSetModelTransform = command( 'viewer.set_model_transform', 'Set Model Transform', ( _bonsai, sourceId, transform ) => {

	Scene.setModelTransform( sourceId, transform );

}, true );

const ViewerClearModelTransform = command( 'viewer.clear_model_transform', 'Clear Model Transform', ( _bonsai, sourceId ) => {

	Scene.clearModelTransform( sourceId );

}, true );

class ViewerObjectPicked extends Operator {

	static operatorName = 'viewer.object_picked';
	static operatorLabel = 'Object Picked';

	constructor( context, pick ) {

		super( context );
		this.pick = pick;

	}

	execute() {

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

		const ids = this.ids ?? Scene.getSelection();
		this.context.signals.selectionChanged.dispatch( { ids } );
		return { status: 'FINISHED' };

	}

}

export function bindViewer( bonsai ) {

	bonsai._viewerUnsubs.push(
		Scene.onSelect( ( pick ) => {

			new ViewerObjectPicked( bonsai, pick ).run();

		} ),
		Scene.onSelectionChange( ( ids ) => {

			new ViewerSelectionChanged( bonsai, ids ).run();

		} ),
	);

}

export { ViewerObjectPicked, ViewerSelectionChanged };

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
	ViewerSetCamera,
	ViewerSetFederationUnit,
	ViewerSetFalseOrigin,
	ViewerSetModelTransform,
	ViewerClearModelTransform,
	ViewerObjectPicked,
	ViewerSelectionChanged,
];
