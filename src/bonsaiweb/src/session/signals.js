// Signals — the session's event bus. One Signal per observable moment in
// the viewer's life: boot, model streaming, selection, display, camera,
// input mapping. UI code and addons subscribe here instead of threading
// callbacks through every module.
//
// Payload conventions:
//   - sourceId is the federation handle returned by Loader.addFile/addUrl.
//   - selectionChanged.ids are objectIds (ascending), matching
//     Scene.getSelection().
//   - objectPicked carries the viewer's single-click payload
//     {objectId, guid, modelIndex, sourceId}.
//   - *Changed signals fire after the state is applied, not before.
//
// The js-signals global (`window.signals`) is injected by loadDependencies()
// at runtime, so Signal is resolved inside addSignals() rather than at
// module parse time.

export function addSignals() {

	const { Signal } = globalThis.signals;
	return {
		// SESSION LIFECYCLE
		appReady: new Signal(),
		viewerReady: new Signal(),
		viewportResized: new Signal(),

		// MODEL LIFECYCLE
		modelLoadStarted: new Signal(), // { source: 'file'|'url', name? }
		modelLoaded: new Signal(), // { sourceId }
		modelCleared: new Signal(), // ()
		modelLoadedToGPU: new Signal(), // { sourceId, ok }
		modelUnloaded: new Signal(), // { sourceId }
		modelNameChanged: new Signal(), // { sourceId, name }
		// Fires once the main-thread ifcopenshell has finished opening the
		// live IFC that pairs with a loaded sidecar — the data-side analogue
		// of modelLoaded. tool.Ifc promotes that source from view to edit,
		// so attribute / pset / qto lookups return something richer than the
		// sidecar's four basic fields. { sourceId, name, file }.
		liveIfcReady: new Signal(),

		// SCENE: SELECTION
		objectPicked: new Signal(), // ({objectId, guid, modelIndex, sourceId})
		selectionChanged: new Signal(), // ({ ids: number[] })
		selectionCleared: new Signal(), // ()

		// SCENE: VISIBILITY & DISPLAY
		visibilityChanged: new Signal(), // ({ action, target? })
		xrayToggled: new Signal(), // ({ active })
		colorsChanged: new Signal(), // ({ action, target?, color? })
		backgroundChanged: new Signal(), // ({ color })

		// CAMERA
		cameraChanged: new Signal(), // (cameraState)
		standardViewSet: new Signal(), // ({ id })

		// CONTROLS
		navPresetChanged: new Signal(), // ({ preset })

		// HISTORY
		historyChanged: new Signal(), // (cmd | undefined)
	};

}
