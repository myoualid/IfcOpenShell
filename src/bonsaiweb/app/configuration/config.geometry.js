/**
 * Startup defaults for IFC → .ifcview conversion. Load operators
 * (`project.open_file`, `load.ifc`, `load.sample.ifc`) accept the same keys
 * as an options object to override any of them for one call.
 */
export const GeometryConfig = {
	// IfcOpenShell geometry kernel plugin: 'opencascade', 'manifold',
	// 'hybrid-manifold-opencascade', 'passthrough', …
	kernel: 'manifold',
	// 'auto' and 'worker' convert in a worker at every size. 'main' is an
	// explicit opt-in: it blocks frames and shares the live-file runtime.
	thread: 'worker',
	// 'stream' feeds tessellation parts into the viewer as they finish.
	// 'end' waits for the finished sidecar, then opens it in one step.
	delivery: 'stream',
};
