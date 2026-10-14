// Adapter from @ifc-lite/geometry's MeshData shape to the ifcopenshell Mesh
// shape that SidecarMeshAccumulator consumes.
//
// Two coordinate deltas we normalise here:
//
//   1. RTC origin folding. ifc-lite emits `positions` in a per-mesh local
//      frame plus a per-mesh `origin` such that `world = origin + position`.
//      ifcopenshell / bonsaiweb's sidecar expects positions already in world
//      coordinates, so we add origin into each vertex up front.
//
//   2. Axis convention. ifc-lite emits WebGL Y-up; bonsaiweb (like IFC
//      itself) is Z-up. We rotate -90° about X: `(x, y, z) → (x, -z, y)`.
//      Same transform applies to normals (orientation-preserving).
//
// Other semantic deltas worth being aware of:
//   • ifc-lite applies the IFC placement at mesh extraction, so after the
//     two normalisations above every mesh is placed-in-world. We hand the
//     sidecar an identity 4×4 transform and one instance per element. That
//     loses the per-type GPU instancing bonsaiviewer's sidecar can do, but
//     correctness first — we can recover instancing later via `localToWorld`.
//   • ifc-lite reports ONE material per mesh (`color`, `materialId`),
//     where ifcopenshell reports a per-face materialIds array plus a
//     colour palette. We broadcast the single ifc-lite colour to a
//     per-face array with materialId 0 everywhere.
//   • ifc-lite doesn't currently surface edges in a shape the sidecar
//     wants — we pass an empty buffer; the sidecar builder tolerates this.
//   • guid / name are not in ifc-lite's MeshData. We leave them empty here
//     and let the main-thread ifcopenshell liveIfc path fill them when it
//     binds the real file to (Context) SessionState (same flow bonsaiviewer uses).

// V8 refuses to freeze TypedArray *views*, so these shared buffers are
// mutable in principle — we rely on the fact that we only ever hand out
// `.slice()` copies (for transform) or empty-length views that have no
// writeable slots. Don't mutate these constants.
const IDENTITY4x4 = new Float64Array( [
	1, 0, 0, 0,
	0, 1, 0, 0,
	0, 0, 1, 0,
	0, 0, 0, 1,
] );

const EMPTY_U32 = new Uint32Array( 0 );
const EMPTY_I32 = new Int32Array( 0 );
const EMPTY_F32 = new Float32Array( 0 );

function sanitiseColor( c ) {

	if ( ! Array.isArray( c ) || c.length < 4 ) return [ 0.72, 0.72, 0.74, 1 ];
	const r = Number.isFinite( c[ 0 ] ) ? c[ 0 ] : 0.72;
	const g = Number.isFinite( c[ 1 ] ) ? c[ 1 ] : 0.72;
	const b = Number.isFinite( c[ 2 ] ) ? c[ 2 ] : 0.74;
	const a = Number.isFinite( c[ 3 ] ) ? c[ 3 ] : 1;
	return [ r, g, b, a ];

}

// Y-up (ifc-lite) → Z-up (bonsaiweb/IFC): rotate -90° about X.
//   out.x = in.x
//   out.y = -in.z
//   out.z =  in.y
// Positions additionally fold in the per-mesh `origin` so the result is
// absolute world coord in Z-up metres. Normals use the same rotation but no
// translation (direction, not point).
function foldPositionsYupToZup( positions, origin ) {

	const [ ox, oy, oz ] = origin ?? [ 0, 0, 0 ];
	const n = positions.length;
	const out = new Float32Array( n );
	for ( let i = 0; i < n; i += 3 ) {

		const x = positions[ i ] + ox;
		const y = positions[ i + 1 ] + oy;
		const z = positions[ i + 2 ] + oz;
		out[ i ] = x;
		out[ i + 1 ] = - z;
		out[ i + 2 ] = y;

	}

	return out;

}

function rotateNormalsYupToZup( normals ) {

	if ( ! normals || normals.length === 0 ) return null;
	const n = normals.length;
	const out = new Float32Array( n );
	for ( let i = 0; i < n; i += 3 ) {

		const x = normals[ i ];
		const y = normals[ i + 1 ];
		const z = normals[ i + 2 ];
		out[ i ] = x;
		out[ i + 1 ] = - z;
		out[ i + 2 ] = y;

	}

	return out;

}

/**
 * Convert a single ifc-lite {@link MeshData} to an ifcopenshell-shaped Mesh.
 * The returned object is structurally compatible with
 * `src/ts/ifcopenshell-js/src/geom/mesh.ts`'s Mesh<'float32'>.
 */
export function adaptMeshDataToIfcMesh( mesh ) {

	const indices = mesh.indices ?? EMPTY_U32;
	const uvs = mesh.uvs ?? EMPTY_F32;
	const triCount = ( indices.length / 3 ) | 0;
	const positions = foldPositionsYupToZup( mesh.positions ?? EMPTY_F32, mesh.origin );
	const normals = rotateNormalsYupToZup( mesh.normals );

	// SidecarMeshAccumulator reads one materialId per face and looks it up
	// in the colour palette. ifc-lite emits a single colour per mesh, so we
	// hand back a single-entry palette and a materialIds array of zeros.
	const [ r, g, b, a ] = sanitiseColor( mesh.color );
	const materialIds = new Int32Array( triCount ); // zeros
	const colors = new Float32Array( [ r, g, b, a ] );

	// Per-face item id for the viewer's picking / xray slot. ifc-lite's
	// `geometryItemId` is per-mesh when present; broadcast it so item-based
	// drilldowns resolve back to the right representation item (#2985 over
	// in ifc-lite). Fallback 0 is harmless.
	const itemId = mesh.geometryItemId ?? mesh.materialId ?? 0;
	const itemIds = new Int32Array( triCount );
	if ( itemId !== 0 ) itemIds.fill( itemId );

	return {
		id: mesh.expressId ?? 0,
		guid: '', // filled downstream via liveIfcReady
		type: mesh.ifcType ?? 'IfcProduct',
		name: '', // filled downstream via liveIfcReady
		vertices: positions,
		faces: indices,
		normals: normals,
		edges: EMPTY_U32,
		transform: IDENTITY4x4.slice(), // placement baked into positions
		materialIds,
		itemIds,
		edgeItemIds: EMPTY_I32,
		uvs,
		colors,
	};

}
