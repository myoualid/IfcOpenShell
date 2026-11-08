// This file was generated with the assistance of an AI coding tool.

// bonsai.context — what is current, like bpy.context. It owns nothing:
// each property is a reference into bonsai.store or a fresh plain object,
// so any value can be kept, compared, or passed back to a tool.
//
//   scene         store.scene
//   camera        { target, distance, yaw, pitch, eye, ortho }; pass it to
//                 tool.Viewer.get().setCamera() to restore the view
//   controls      { preset, section, fly, ortho, grid, axes, fog, xray, outline }
//   activeObject  the last pick { objectId, guid, sourceId, ... }, or null
//   selectedIds   selected objectIds, ascending
//   activeModel   the store.models entry of activeObject, or null
//
// Panels may hang their own state on it (context.settings, context.workMode).

import { Signals } from './signals.js';
import { store } from './store.js';
import { readControls, Viewer } from '../tool/Viewer.js';

let activeObject = null;
let preset = null;

Signals.objectPicked.add( ( pick ) => {

	activeObject = pick?.objectId || pick?.guid ? pick : null;

} );
Signals.modelCleared.add( () => {

	activeObject = null;

} );
Signals.navPresetChanged.add( ( payload ) => {

	preset = payload.preset;

} );

export const context = {
	signals: Signals,
	// The page element Bonsai lives in, and the element it owns for the canvas.
	dom: null,
	viewport: null,
	get scene() {

		return store.scene;

	},
	get camera() {

		return Viewer.get()?.getCamera() ?? null;

	},
	get controls() {

		const viewer = Viewer.get();
		return viewer ? { preset, ...readControls( viewer ) } : null;

	},
	get activeObject() {

		return activeObject;

	},
	get selectedIds() {

		return Viewer.get()?.getSelection() ?? [];

	},
	get activeModel() {

		return store.models.find( ( entry ) => entry.id === activeObject?.sourceId ) ?? null;

	},
};
