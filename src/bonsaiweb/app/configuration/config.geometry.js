/**
 * Startup defaults for IFC → .ifcview conversion. Load operators
 * (`project.open_file`, `load.ifc`, `load.sample.ifc`) accept the same keys
 * as an options object to override any of them for one call.
 */
export const GeometryConfig = {
	// 'ifc-lite' (Rust/wasm pipeline) or 'ifcopenshell' (CDN package, as in
	// threejs.html; main thread only).
	engine: 'ifc-lite',
	// IfcOpenShell geometry kernel plugin: 'opencascade', 'manifold',
	// 'hybrid-manifold-opencascade', 'passthrough', … Ignored by ifc-lite.
	kernel: 'manifold',
	// 'worker' keeps the UI responsive; 'main' runs on the main thread,
	// which is easier to debug and profile. ifcopenshell needs 'main'.
	thread: 'worker',
};
