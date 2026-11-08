// Pins the converter's .ifcview version to the IfcOpenShell viewer this app is
// built against, and checks the converter end to end in Node.
// Version mismatch → viewer logs `loadIfcViewMetadataWeb: bad .ifcview head
// (wrong version?)` and refuses to render.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { initSync } from '../src/pipeline/ifcview/wasm/ifcview_wasm.js';
import { IfcViewBuilder, appendIfcMesh, formatVersion, inspect } from '../src/pipeline/ifcview/index.js';
import { convertGltfBytes } from '../src/pipeline/ifcview/gltf.js';
import { detectFormat } from '../src/pipeline/detect.js';

const VIEWER_HEADER = fileURLToPath( new URL( '../../ifcviewer/IfcViewFormat.h', import.meta.url ) );
const WASM = fileURLToPath( new URL( '../src/pipeline/ifcview/wasm/ifcview_wasm_bg.wasm', import.meta.url ) );

initSync( { module: await readFile( WASM ) } );

test( 'converter writes the C++ IFCVIEW_VERSION', async () => {
	const src = await readFile( VIEWER_HEADER, 'utf8' );
	const m = src.match( /IFCVIEW_VERSION\s*=\s*(\d+)\s*;/ );
	assert.ok( m, 'IFCVIEW_VERSION not found in IfcViewFormat.h' );
	assert.equal( formatVersion(), Number( m[ 1 ] ) );
} );

const triangle = ( id, type, x ) => ( {
	id,
	type,
	vertices: new Float32Array( [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] ),
	normals: null,
	faces: new Uint32Array( [ 0, 1, 2 ] ),
	colors: new Float32Array( [ 1, 0, 0, 1 ] ),
	materialIds: new Int32Array( [ 0 ] ),
	transform: new Float64Array( [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1 ] ),
} );

test( 'ifcopenshell shapes share one mesh and keep their elements', () => {
	const builder = new IfcViewBuilder();
	const metadata = new Map( [ [ 11, { name: 'A', guid: '0123456789abcdefghijkl', type: 'IfcWall' } ] ] );
	appendIfcMesh( builder, triangle( 11, 'IfcWall', 0 ), metadata );
	appendIfcMesh( builder, triangle( 12, 'IfcSlab', 5 ), metadata );
	assert.equal( appendIfcMesh( builder, triangle( 13, 'IfcOpeningElement', 9 ), metadata ), undefined );
	assert.equal( builder.meshCount, 1 );
	assert.equal( builder.instanceCount, 2 );
	const summary = inspect( builder.finish( 1 ) );
	assert.equal( summary.version, formatVersion() );
	assert.equal( summary.meshCount, 1 );
	assert.equal( summary.instanceCount, 2 );
	assert.equal( summary.elementCount, 2 );
	builder.free();
} );

// Minimal GLB: one triangle mesh used by two nodes.
function sampleGlb() {
	const bin = new Uint8Array( 44 );
	new Float32Array( bin.buffer, 0, 9 ).set( [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] );
	new Uint16Array( bin.buffer, 36, 3 ).set( [ 0, 1, 2 ] );
	const json = JSON.stringify( {
		asset: { version: '2.0' },
		scene: 0,
		scenes: [ { nodes: [ 0, 1 ] } ],
		nodes: [ { name: 'IfcColumn/C1', mesh: 0 }, { name: 'Box', mesh: 0, translation: [ 3, 0, 0 ] } ],
		meshes: [ { primitives: [ { attributes: { POSITION: 0 }, indices: 1 } ] } ],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [ 0, 0, 0 ], max: [ 1, 1, 0 ] },
			{ bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
		],
		bufferViews: [ { buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 } ],
		buffers: [ { byteLength: 44 } ],
	} );
	const jsonBytes = new TextEncoder().encode( json.padEnd( Math.ceil( json.length / 4 ) * 4, ' ' ) );
	const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
	const out = new Uint8Array( total );
	const view = new DataView( out.buffer );
	view.setUint32( 0, 0x46546c67, true );
	view.setUint32( 4, 2, true );
	view.setUint32( 8, total, true );
	view.setUint32( 12, jsonBytes.length, true );
	view.setUint32( 16, 0x4e4f534a, true );
	out.set( jsonBytes, 20 );
	const binAt = 20 + jsonBytes.length;
	view.setUint32( binAt, bin.length, true );
	view.setUint32( binAt + 4, 0x004e4942, true );
	out.set( bin, binAt + 8 );
	return out;
}

test( 'GLB is detected and converted', async () => {
	const glb = sampleGlb();
	assert.equal( detectFormat( glb, 'export.bin' ), 'gltf' );
	assert.equal( detectFormat( new Uint8Array( 0 ), 'scene.gltf' ), 'gltf' );
	const result = await convertGltfBytes( glb, 'export.glb' );
	assert.equal( result.meshCount, 1 );
	assert.equal( result.productCount, 2 );
	const summary = inspect( result.sidecarBytes );
	assert.equal( summary.instanceCount, 2 );
	assert.equal( summary.elementCount, 2 );
} );
