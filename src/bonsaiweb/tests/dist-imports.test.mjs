// Guards the worker-friendly import rewrite. The convert pipeline runs
// inside a module worker that inherits no import map, so bare specifiers
// in the compiled dist would blow up at load time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

const ROOT = fileURLToPath( new URL( '../dist/core/IfcPipeline/', import.meta.url ) );
const TS_ROOT = fileURLToPath( new URL( '../src/core/IfcPipeline/', import.meta.url ) );
const FORBIDDEN = [ 'ifcopenshell', '@ioai/wasm-zstd', 'fzstd' ];

async function walk( dir ) {
	const entries = await readdir( dir, { withFileTypes: true } );
	const files = [];
	for ( const entry of entries ) {
		const full = join( dir, entry.name );
		if ( entry.isDirectory() ) files.push( ...await walk( full ) );
		else files.push( full );
	}
	return files;
}

function runtimeImportsOf( source ) {
	// Match `import ... from "x"` and `import "x"` but NOT `import type ... from "x"`.
	const matches = [];
	const importRe = /^\s*import\s+(?!type\s)(?:[^'"\n]+?from\s+)?['"]([^'"\n]+)['"];?\s*$/gm;
	let m;
	while ( ( m = importRe.exec( source ) ) ) matches.push( m[ 1 ] );
	return matches;
}

test( 'compiled dist has no bare specifiers that break module workers', async () => {
	const files = ( await walk( ROOT ) ).filter( ( f ) => extname( f ) === '.js' );
	assert.ok( files.length > 0, 'IfcPipeline dist should contain .js files' );
	for ( const file of files ) {
		const source = await readFile( file, 'utf8' );
		for ( const spec of runtimeImportsOf( source ) ) {
			assert.ok(
				!FORBIDDEN.includes( spec ),
				`${ file } imports bare "${ spec }" — must use a relative URL for the worker`,
			);
		}
	}
} );

test( 'every relative import in the dist resolves to a file on disk', async () => {
	const files = ( await walk( ROOT ) ).filter( ( f ) => extname( f ) === '.js' );
	const importRe = /^\s*(?:import|export)\s+(?:[^'"\n]+?from\s+)?['"](\.[^'"\n]+)['"];?\s*$/gm;
	const failures = [];
	for ( const file of files ) {
		const source = await readFile( file, 'utf8' );
		let m;
		while ( ( m = importRe.exec( source ) ) ) {
			const resolved = fileURLToPath( new URL( m[ 1 ], 'file://' + file.replace( /\\/g, '/' ) ) );
			try { await stat( resolved ); }
			catch { failures.push( `${ file }\n  imports ${ m[ 1 ] }\n  → ${ resolved } (missing)` ); }
		}
	}
	assert.equal( failures.length, 0, failures.join( '\n\n' ) );
} );

test( 'ts sources also use relative paths (prevents rebuild regression)', async () => {
	const files = ( await walk( TS_ROOT ) ).filter( ( f ) => extname( f ) === '.ts' );
	for ( const file of files ) {
		const source = await readFile( file, 'utf8' );
		for ( const spec of runtimeImportsOf( source ) ) {
			assert.ok(
				!FORBIDDEN.includes( spec ),
				`${ file } imports bare "${ spec }" — the next tsc run will regenerate a broken dist`,
			);
		}
	}
} );
