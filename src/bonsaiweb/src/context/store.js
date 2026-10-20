// One store per Bonsai. models is every model the viewer has loaded.
// Each entry is { sourceId, name, viewName, mode, file }:
//   - mode 'edit' — a .ifc is open in ifcopenshell beside the .ifcview.
//     `file` is that ifcopenshell file. `name` is the .ifc filename.
//   - mode 'view' — only the .ifcview is loaded. `file` is null.
//     `name` and `viewName` are the .ifcview filename.
// selection is the current viewer pick, or null. Its `guid` is the
// element's GlobalId in either mode. tool.Ifc reads the active store.

export const Store = {
	models: [],
	selection: null,
};


export function getStore() {

	return Store;

}

export function listenStore( signals ) {

	signals.objectPicked.add( ( pick ) => {

		if ( ! pick?.objectId && ! pick?.guid ) {

			Store.selection = null;
			return;

		}

		Store.selection = pick;

	} );

	signals.modelCleared.add( () => {

		Store.selection = null;

	} );

}
