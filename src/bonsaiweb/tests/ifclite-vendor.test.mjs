// Pins the vendored @ifc-lite/* snapshot that the ifc-lite ConvertWorker
// depends on. If anyone deletes/moves a package or forgets to pull the
// wasm binary when upgrading, these tests fail with a precise message.
//
// We don't try to run ifc-lite's wasm from Node here — it uses browser
// APIs (fetch + import.meta.url relative to the module file) that would
// need polyfilling. Those paths are exercised in the browser by the live
// app; this file guards the static tree only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const VENDOR_ROOT = fileURLToPath(
	new URL( '../vendor/@ifc-lite/', import.meta.url ),
);

// Entry points we actively import from. Keep in lock-step with
// src/pipeline/lite/convert.js imports plus whatever the
// geometry package reaches at runtime.
const REQUIRED_ENTRYPOINTS = [
	{ pkg: 'geometry',       path: 'dist/index.js' },
	{ pkg: 'geometry',       path: 'dist/ifc-lite-bridge.js' },
	{ pkg: 'geometry',       path: 'dist/wasm-shared-module.js' },
	{ pkg: 'wasm',           path: 'pkg/ifc-lite.js' },
	{ pkg: 'wasm',           path: 'pkg/ifc-lite_bg.wasm' },
	{ pkg: 'data',           path: 'dist/index.js' },
	{ pkg: 'encoding',       path: 'dist/index.js' },
	{ pkg: 'wasm-lifecycle', path: 'dist/index.js' },
];

const WASM_MAGIC = Buffer.from( [ 0x00, 0x61, 0x73, 0x6d ] );

for ( const { pkg, path } of REQUIRED_ENTRYPOINTS ) {
	test( `vendored @ifc-lite/${ pkg } ships ${ path }`, async () => {
		const file = new URL( `${ pkg }/${ path }`, `file://${ VENDOR_ROOT }` );
		const info = await stat( file );
		assert.ok( info.isFile(), `${ pkg }/${ path } is not a regular file` );
		assert.ok(
			info.size > 256,
			`${ pkg }/${ path } is suspiciously small (${ info.size } bytes) — stale or truncated vendor snapshot`,
		);
	} );
}

test( '@ifc-lite/wasm/pkg/ifc-lite_bg.wasm is a valid wasm module', async () => {
	const file = new URL( 'wasm/pkg/ifc-lite_bg.wasm', `file://${ VENDOR_ROOT }` );
	const fh = await open( file, 'r' );
	try {
		const header = Buffer.alloc( 4 );
		await fh.read( header, 0, 4, 0 );
		assert.deepEqual(
			Array.from( header ),
			Array.from( WASM_MAGIC ),
			'ifc-lite_bg.wasm is missing the \\0asm wasm magic',
		);
	} finally {
		await fh.close();
	}
} );

test( 'every import specifier in vendored .js is a valid relative URL (workers have no importmap)', async () => {
	// Browsers only resolve module specifiers that start with ./ or ../ (or
	// a full URL). Anything else is a "bare specifier" that depends on an
	// import map, and workers don't inherit the page's map. We iterate the
	// vendored .js files and reject any `from '…'` / `import('…')` whose
	// specifier isn't relative.
	//
	// A specific exception: ifc-lite's bridge keeps a Node-only
	// `requireFromHere.resolve('@ifc-lite/wasm/...')` branch for Tauri; it's
	// unreachable in the browser worker and doesn't need rewriting.
	const { readdir } = await import( 'node:fs/promises' );
	const { join } = await import( 'node:path' );
	async function walk( dir ) {
		const out = [];
		for ( const entry of await readdir( dir, { withFileTypes: true } ) ) {
			const abs = join( dir, entry.name );
			if ( entry.isDirectory() ) out.push( ...( await walk( abs ) ) );
			else if ( entry.name.endsWith( '.js' ) ) out.push( abs );
		}
		return out;
	}
	const files = await walk( VENDOR_ROOT );
	// Match the ACTUAL import forms, not any `from "…"` that happens to live
	// inside a string literal:
	//   • static:   import X from '…'        import '…'       export … from '…'
	//   • dynamic:  import('…')
	// We anchor on `\b(?:import|export)` plus the characters that must follow
	// in each form, so prose strings in diagnostics messages don't match.
	const specRe = /\b(?:import\s*\(\s*|import\s+(?:[\w*{},\s]+from\s+)?|export\s+(?:[\w*{},\s]+from\s+))(['"])([^'"]+)\1/g;
	const offenders = [];
	for ( const file of files ) {
		const text = await readFile( file, 'utf8' );
		let m;
		specRe.lastIndex = 0;
		while ( ( m = specRe.exec( text ) ) !== null ) {
			const spec = m[ 2 ];
			if ( spec.startsWith( './' ) || spec.startsWith( '../' ) ) continue;
			if ( /^https?:/.test( spec ) ) continue;
			// node: scheme is Node-only and lives behind an environment branch
			// in the vendored packages; it's unreachable from the browser worker.
			if ( spec.startsWith( 'node:' ) ) continue;
			// Tauri-only dynamic imports in ifc-lite's native-bridge are gated
			// by `isTauri()` and never evaluated in a browser worker.
			if ( spec.startsWith( '@tauri-apps/' ) ) continue;
			// Allow Node-only branches that use require.resolve for bare specs.
			const ctx = text.slice( Math.max( 0, m.index - 50 ), m.index );
			if ( /requireFromHere\.resolve|require\.resolve/.test( ctx ) ) continue;
			const rel = file.split( /[\\/]@ifc-lite[\\/]/ )[ 1 ]?.replace( /\\/g, '/' ) ?? file;
			offenders.push( `${ rel }: ${ m[ 0 ].trim() }` );
		}
	}
	assert.deepEqual(
		offenders,
		[],
		`Vendored .js has non-relative module specifiers that will fail at Worker load time:\n${ offenders.join( '\n' ) }`,
	);
} );

test( 'legacy test: no raw bare @ifc-lite/* specifiers (would also fail)', async () => {
	const { readdir } = await import( 'node:fs/promises' );
	const { join } = await import( 'node:path' );
	async function walk( dir ) {
		const out = [];
		for ( const entry of await readdir( dir, { withFileTypes: true } ) ) {
			const abs = join( dir, entry.name );
			if ( entry.isDirectory() ) out.push( ...( await walk( abs ) ) );
			else if ( entry.name.endsWith( '.js' ) ) out.push( abs );
		}
		return out;
	}
	const files = await walk( VENDOR_ROOT );
	// A single Node-only bare specifier is tolerated: ifc-lite-bridge.js's
	// Tauri/Node-side `requireFromHere.resolve('@ifc-lite/wasm/...')` branch
	// is unreachable in the browser worker, so it doesn't need rewriting.
	const bareRe = /['"]@ifc-lite\/[^'"]+['"]/g;
	const offenders = [];
	for ( const file of files ) {
		const text = await readFile( file, 'utf8' );
		const matches = text.match( bareRe );
		if ( !matches ) continue;
		for ( const m of matches ) {
			const context = text.slice( Math.max( 0, text.indexOf( m ) - 25 ), text.indexOf( m ) + m.length + 10 );
			if ( /requireFromHere\.resolve|require\.resolve/.test( context ) ) continue;
			const rel = file.split( /[\\/]@ifc-lite[\\/]/ )[ 1 ]?.replace( /\\/g, '/' ) ?? file;
			offenders.push( `${ rel }: ${ m }` );
		}
	}
	assert.deepEqual(
		offenders,
		[],
		`Bare @ifc-lite specifiers would fail at runtime in a Worker (no importmap). Rewrite to relative paths.\n${ offenders.join( '\n' ) }`,
	);
} );
