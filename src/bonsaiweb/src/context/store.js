// bonsai.store — the session's data, like bpy.data. One entry per model,
// never one per object: objects stay in the viewer and are addressed by
// objectId.
//
// models is every model the viewer has loaded. Each entry is
// { id, name, file }:
//   - id is the viewer source id, counting up from 0.
//   - name is the model filename (.ifc or .ifcview).
//   - file is the ifcopenshell file, or null while only the .ifcview
//     is loaded.
//
// scene is read-only. Assigning a field throws; change it through
// bonsai.ops or tool.Scene. Each field reads its source of truth, so
// nothing here can drift from the viewer.

import { Federation } from '../tool/federation.js';
import { Viewer } from '../tool/Viewer.js';

// The viewer has no background getter, so tool.Scene records it here.
export const sceneRecord = { background: null };

export const store = {
	models: [],
	scene: Object.freeze( {
		get background() {

			return sceneRecord.background;

		},
		get unit() {

			return { ...Federation.get().unit };

		},
		get falseOrigin() {

			return Viewer.get()?.getFalseOrigin() ?? null;

		},
		get fog() {

			return Viewer.get()?.fog() ?? null;

		},
		get grids() {

			return Viewer.get()?.listGrids() ?? [];

		},
	} ),
};
