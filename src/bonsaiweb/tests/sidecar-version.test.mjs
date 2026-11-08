// Pins the sidecar version to the IfcOpenShell viewer this app is built against.
// Mismatch → viewer logs `loadIfcViewMetadataWeb: bad .ifcview head (wrong version?)`
// and refuses to render.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const VIEWER_HEADER = fileURLToPath( new URL( '../../ifcviewer/IfcViewFormat.h', import.meta.url ) );
const GENERATED = fileURLToPath( new URL( '../src/pipeline/sidecar/viewer-sidecar-format.generated.js', import.meta.url ) );
const TYPES = fileURLToPath( new URL( '../src/pipeline/sidecar/types.js', import.meta.url ) );

async function readCppVersion() {
	const src = await readFile( VIEWER_HEADER, 'utf8' );
	const m = src.match( /IFCVIEW_VERSION\s*=\s*(\d+)\s*;/ );
	assert.ok( m, 'IFCVIEW_VERSION not found in IfcViewFormat.h' );
	return Number( m[ 1 ] );
}

async function readConst( file, name ) {
	const src = await readFile( file, 'utf8' );
	const m = src.match( new RegExp( `${ name }\\s*=\\s*(\\d+)` ) );
	assert.ok( m, `${ name } not found in ${ file }` );
	return Number( m[ 1 ] );
}

test( 'sidecar version matches C++ IFCVIEW_VERSION', async () => {
	const cpp = await readCppVersion();
	const js = await readConst( GENERATED, 'VIEWER_SIDECAR_FORMAT_VERSION' );
	assert.equal( js, cpp, `sidecar ${ js } vs C++ ${ cpp }` );
} );

// Record-layout pin. ElementTableRecord is 9 uint32-sized fields = 36 bytes.
// If the C++ struct grows a field the writer must grow with it or the viewer
// silently rejects the element metadata ('loadElementMetadataWeb failed').

async function readStructFieldCount( structName ) {
	const src = await readFile( VIEWER_HEADER, 'utf8' );
	const re = new RegExp( `struct\\s+${ structName }\\s*\\{([^}]+)\\}`, 'm' );
	const m = src.match( re );
	assert.ok( m, `${ structName } not found` );
	const body = m[ 1 ];
	const fields = body.match( /\b(?:uint32_t|int32_t|float|uint8_t\s*\[\s*4\s*\])\b/g ) ?? [];
	return fields.length;
}

test( 'PACKED_ELEMENT_BYTE_LENGTH matches C++ ElementTableRecord size', async () => {
	const cppBytes = ( await readStructFieldCount( 'ElementTableRecord' ) ) * 4;
	const js = await readConst( TYPES, 'PACKED_ELEMENT_BYTE_LENGTH' );
	assert.equal( js, cppBytes, `sidecar has ${ js } bytes/record vs C++ ${ cppBytes }` );
} );

// v19 instance record: 2×u32 + 3×f64 + 9×f32 = 68, no padding.
test( 'INSTANCE_CPU_BYTE_LENGTH matches v19 IFCVIEW_INSTANCE_RECORD_BYTES', async () => {
	const src = await readFile( VIEWER_HEADER, 'utf8' );
	assert.match(
		src,
		/IFCVIEW_INSTANCE_RECORD_BYTES\s*=\s*\n?\s*2 \* sizeof\(uint32_t\) \+ 3 \* sizeof\(double\) \+ 9 \* sizeof\(float\)/,
	);
	const js = await readConst( TYPES, 'INSTANCE_CPU_BYTE_LENGTH' );
	assert.equal( js, 68 );
} );
