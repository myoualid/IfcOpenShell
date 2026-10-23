// One store per Bonsai. models is every model the viewer has loaded.
// Each entry is { id, name, file }:
//   - id is the viewer source id, counting up from 0.
//   - name is the model filename (.ifc or .ifcview).
//   - file is the ifcopenshell file, or null while only the .ifcview
//     is loaded.
// selection is the current viewer pick, or null. Its `guid` is the
// element's GlobalId either way. tool.Ifc reads the active store.

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
