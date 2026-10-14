// Pins the wasm ABI contract between the main module and the SIDE_MODULE
// geometry/schema plugins.
//
// Background: the main ifcopenshell wasm module is linked with
// `-sWASM_BIGINT=1`. This changes how 64-bit integer values at the wasm/JS
// boundary are represented — with the flag, i64 values flow as JS `BigInt`
// instead of being "legalized" into i32 pairs by generated JS trampolines.
//
// Every SIDE_MODULE plugin that gets dyn-linked into that main module MUST
// be built with the same flag; otherwise cross-module calls that happen to
// carry an i64 blow up at runtime with:
//
//     TypeError: Cannot convert <N> to a BigInt
//         at <plugin wasm>: ...
//         at ifcopenshell_wasm.wasm: ...
//
// This is what currently happens when we switch the convert pipeline to
// the `manifold` or `cgal` kernels — their conversion-result API carries
// a 64-bit count across the dyn-link boundary and the plugin was built
// without BIGINT. opencascade and passthrough happen not to exercise an
// i64 at the boundary, so they survive.
//
// These tests fail until `cmake/utilities.cmake` adds `-sWASM_BIGINT=1`
// to `ifcopenshell_wasm_plugin_link_options`, after which the wasm
// plugins must be rebuilt and copied into
// `src/ts/ifcopenshell-js/wasm/plugins/`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PLUGIN_LINK_CMAKE = fileURLToPath(
	new URL( '../../../cmake/utilities.cmake', import.meta.url ),
);
const MAIN_WASM_CMAKE = fileURLToPath(
	new URL( '../../ifcwrap/wasm.cmake', import.meta.url ),
);

function hasBigIntFlag( src ) {
	// Match the Emscripten shell flag in either spaced or unspaced form:
	//   -sWASM_BIGINT=1        or
	//   -s WASM_BIGINT=1
	return /-s\s*WASM_BIGINT\s*=\s*1/.test( src );
}

test( 'main ifcopenshell wasm module is linked with -sWASM_BIGINT=1', async () => {
	const src = await readFile( MAIN_WASM_CMAKE, 'utf8' );
	assert.ok(
		hasBigIntFlag( src ),
		'main module must enable WASM_BIGINT so i64 values use JS BigInt at the boundary',
	);
} );

test( 'SIDE_MODULE plugins are linked with -sWASM_BIGINT=1', async () => {
	const src = await readFile( PLUGIN_LINK_CMAKE, 'utf8' );
	// Scope the check to the plugin link options function so we don't
	// accidentally pass on an unrelated BIGINT mention elsewhere in the file.
	const fnMatch = src.match(
		/function\s*\(\s*ifcopenshell_wasm_plugin_link_options[^)]*\)([\s\S]*?)endfunction\s*\(\s*\)/,
	);
	assert.ok( fnMatch, 'ifcopenshell_wasm_plugin_link_options not found in utilities.cmake' );
	assert.ok(
		hasBigIntFlag( fnMatch[ 1 ] ),
		[
			'Plugin SIDE_MODULE link options must enable WASM_BIGINT to match the main module.',
			'Without it, cross-module calls carrying i64 (e.g. manifold / cgal kernel results)',
			'throw "Cannot convert <N> to a BigInt" at the dyn-link trampoline.',
			'Add "SHELL:-sWASM_BIGINT=1" to the target_link_options list in',
			'ifcopenshell_wasm_plugin_link_options in cmake/utilities.cmake, then rebuild and',
			'copy src/ts/ifcopenshell-js/wasm/plugins/*.wasm from the build output.',
		].join( ' ' ),
	);
} );

test( 'plugin and main module WASM_BIGINT settings agree', async () => {
	const [ mainSrc, pluginSrc ] = await Promise.all( [
		readFile( MAIN_WASM_CMAKE, 'utf8' ),
		readFile( PLUGIN_LINK_CMAKE, 'utf8' ),
	] );
	assert.equal(
		hasBigIntFlag( mainSrc ),
		hasBigIntFlag( pluginSrc ),
		'Main module and SIDE_MODULE plugins must agree on WASM_BIGINT; a mismatch means i64 values are legalized on one side and native on the other',
	);
} );
