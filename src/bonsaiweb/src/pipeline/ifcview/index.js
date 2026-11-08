// This file was generated with the assistance of an AI coding tool.
//
// The .ifcview converter. ./wasm/ is the wasm build of ifcview-rs
// (crates/ifcview-wasm), which owns the format: mesh dedup, material baking,
// quantisation, Morton chunk layout and zstd. Nothing here needs ifcopenshell.
// Regenerate ./wasm/ with, from ifcview-rs:
//   wasm-pack build crates/ifcview-wasm --release --target web --no-pack --out-dir <this dir>/wasm
//
// scripts/build.mjs copies the .wasm next to each bundle, so the URL below
// resolves both here and from dist/.

import init, { IfcViewBuilder, convertGltf, formatVersion, inspect } from './wasm/ifcview_wasm.js';

export { IfcViewBuilder, convertGltf, formatVersion, inspect };

const HIDDEN_ELEMENT_TYPES = new Set( [ 'IfcAnnotation', 'IfcOpeningElement' ] );
const EMPTY_F32 = new Float32Array( 0 );

let ready = null;

/** Instantiate the converter once. `wasm` is a URL, Response or bytes. */
export function loadConverter( wasm = new URL( './wasm/ifcview_wasm_bg.wasm', import.meta.url ) ) {

	ready ??= init( { module_or_path: wasm } );
	return ready;

}

const f32 = ( v ) => v instanceof Float32Array ? v : new Float32Array( v ?? [] );

/**
 * Add one ifcopenshell geom shape ({ id, type, vertices, normals, faces,
 * colors, materialIds, transform }) to `builder` as an instance of a
 * deduplicated mesh. `metadata` maps the shape id to { guid, name, type }.
 * Returns the mesh id, or undefined when nothing was added.
 */
export function appendIfcMesh( builder, mesh, metadata = new Map() ) {

	const row = metadata.get( mesh.id );
	const type = row?.type ?? mesh.type ?? '';
	if ( HIDDEN_ELEMENT_TYPES.has( type ) ) return undefined;
	const meshId = builder.addMaterialMesh(
		f32( mesh.vertices ),
		mesh.normals ? f32( mesh.normals ) : EMPTY_F32,
		mesh.faces instanceof Uint32Array ? mesh.faces : new Uint32Array( mesh.faces ?? [] ),
		f32( mesh.colors ),
		mesh.materialIds instanceof Int32Array ? mesh.materialIds : new Int32Array( mesh.materialIds ?? [] ),
	);
	if ( meshId === undefined ) return undefined;
	const element = builder.addElement( row?.name ?? '', type, row?.guid ?? '', mesh.id );
	builder.addInstance( meshId, element, mesh.transform instanceof Float64Array ? mesh.transform : new Float64Array( mesh.transform ) );
	return meshId;

}

/** Build `.ifcview` bytes from ifcopenshell geom shapes. */
export async function sidecarFromIfcMeshes( meshes, metadata, { modelId = 1 } = {} ) {

	await loadConverter();
	const builder = new IfcViewBuilder();
	try {

		for ( const mesh of meshes ) appendIfcMesh( builder, mesh, metadata );
		return builder.finish( modelId );

	} finally {

		builder.free();

	}

}
