// Scene — what the viewer draws: selection, visibility, colour, display
// modes, background, federation placement. Model lifecycle lives in Loader.

import { viewer } from '../viewer/host.js';

export class Scene {

	static get active() {

		return viewer.getActiveObject();

	}
	static get selected() {

		return viewer.getSelectedObjects();

	}
	static get hidden() {

		return viewer.getHidden();

	}

	// getActiveObject() is an objectId (0 when nothing is picked). The guid
	// is only on the element row, and only after getObjects() has run.
	static get activeGuid() {

		const id = viewer.getActiveObject();
		if ( ! id ) return undefined;
		return viewer.getSelectedObjects().find( ( o ) => o.objectId === id )?.guid;

	}

	// ---- Objects / selection ----------------------------------------

	static getObjects() {

		return viewer.getObjects();

	}
	static getSelection() {

		return viewer.getSelection();

	}
	static getActiveObject() {

		return viewer.getActiveObject();

	}
	static getSelectedObjects() {

		return viewer.getSelectedObjects();

	}

	// Guarantees the element table is populated so each entry carries
	// {guid, name, type, model, sourceId} instead of a bare {objectId}.
	static async getSelectedInfo() {

		await viewer.getObjects();
		return viewer.getSelectedObjects();

	}

	static setSelection( x ) {

		viewer.setSelection( x );

	}
	static addToSelection( x ) {

		viewer.addToSelection( x );

	}
	static removeFromSelection( x ) {

		viewer.removeFromSelection( x );

	}
	static clearSelection() {

		viewer.clearSelection();

	}

	static setSelectionOutline( on ) {

		viewer.setSelectionOutline( on );

	}
	static selectionOutlineEnabled() {

		return viewer.selectionOutlineEnabled();

	}

	// ---- Visibility --------------------------------------------------

	static show( x ) {

		viewer.show( x );

	}
	static hide( x ) {

		viewer.hide( x );

	}
	static showAll() {

		viewer.showAll();

	}
	static hideAll() {

		viewer.hideAll();

	}
	static setVisible( x, on ) {

		viewer.setVisible( x, on );

	}
	static getHidden() {

		return viewer.getHidden();

	}

	// There is no getVisible(). Visible rows are the element table minus getHidden().
	static async getVisible() {

		const hidden = new Set( viewer.getHidden() );
		const objects = await viewer.getObjects();
		return objects.filter( ( o ) => ! hidden.has( o.objectId ) );

	}
	static hideSelected() {

		viewer.hideSelected();

	}
	static isolateSelected() {

		viewer.isolateSelected();

	}

	// ---- Display -----------------------------------------------------

	static toggleXray() {

		viewer.toggleXray();

	}
	static xrayActive() {

		return viewer.xrayActive();

	}

	// ---- Colour / background ----------------------------------------

	static setColor( x, color ) {

		viewer.setColor( x, color );

	}
	static clearColors() {

		viewer.clearColors();

	}
	static setBackground( color ) {

		viewer.setBackground( color );

	}

	// ---- Federation --------------------------------------------------

	static setFederationUnit( u ) {

		viewer.setFederationUnit( u );

	}
	static setFalseOrigin( o ) {

		viewer.setFalseOrigin( o );

	}
	static getFalseOrigin() {

		return viewer.getFalseOrigin();

	}
	static setModelTransform( sourceId, xf ) {

		viewer.setModelTransform( sourceId, xf );

	}
	static clearModelTransform( sourceId ) {

		viewer.clearModelTransform( sourceId );

	}
	static getModelGeoref( sourceId ) {

		return viewer.getModelGeoref( sourceId );

	}

	// ---- Events ------------------------------------------------------

	static onSelect( cb ) {

		return viewer.onSelect( cb );

	}
	static onSelectionChange( cb ) {

		return viewer.onSelectionChange( cb );

	}

}

export default Scene;
