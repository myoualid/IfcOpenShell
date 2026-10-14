// Pins the set of geometry kernels staged in the ifcopenshell-js wasm
// plugin bundle. If a rebuild drops a plugin from the output (or forgets
// to copy a newly-built artifact into the bundle) the Loader falls back
// to a kernel that isn't on disk and the convert worker fails to start.
//
// Also sanity-checks that each plugin binary is a well-formed wasm
// module and non-trivial in size, so a 0-byte or stale placeholder
// doesn't silently pass the "file exists" bar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MANIFEST = fileURLToPath(
	new URL( '../../ts/ifcopenshell-js/wasm/ifcopenshell_plugins.json', import.meta.url ),
);
const WASM_ROOT = fileURLToPath(
	new URL( '../../ts/ifcopenshell-js/wasm/', import.meta.url ),
);

const EXPECTED_KERNELS = [ 'passthrough', 'opencascade', 'manifold', 'cgal', 'cgalsimple' ];

const WASM_MAGIC = Buffer.from( [ 0x00, 0x61, 0x73, 0x6d ] );

async function loadManifest() {
	const raw = await readFile( MANIFEST, 'utf8' );
	return JSON.parse( raw );
}

test( 'plugin manifest lists every expected kernel', async () => {
	const manifest = await loadManifest();
	assert.ok( manifest.kernel, 'manifest is missing the "kernel" section' );
	for ( const id of EXPECTED_KERNELS ) {
		assert.ok(
			manifest.kernel[ id ],
			`manifest.kernel["${ id }"] is missing — a kernel was dropped from the build`,
		);
	}
} );

for ( const id of EXPECTED_KERNELS ) {
	test( `kernel plugin "${ id }" is staged and is a well-formed wasm binary`, async () => {
		const manifest = await loadManifest();
		const entry = manifest.kernel[ id ];
		assert.ok( entry?.wasm, `manifest entry for ${ id } is missing a wasm path` );

		const absolute = new URL( entry.wasm, `file://${ WASM_ROOT }` );
		const info = await stat( absolute );
		assert.ok( info.isFile(), `${ entry.wasm } is not a file` );
		// Kernel plugins carry real geometry code; even the leanest kernel
		// (passthrough) is tens of KB. A sub-kilobyte file is a stale stub.
		assert.ok(
			info.size > 1024,
			`${ entry.wasm } is suspiciously small (${ info.size } bytes) — stale/partial build output?`,
		);

		const header = Buffer.alloc( 4 );
		const fh = await ( await import( 'node:fs/promises' ) ).open( absolute, 'r' );
		try {
			await fh.read( header, 0, 4, 0 );
		} finally {
			await fh.close();
		}
		assert.deepEqual(
			Array.from( header ),
			Array.from( WASM_MAGIC ),
			`${ entry.wasm } is missing the \\0asm wasm magic — not a wasm binary`,
		);
	} );
}
