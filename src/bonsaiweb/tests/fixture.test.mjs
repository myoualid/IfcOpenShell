// The autoload path hard-codes app/files/ifc/window_wall.ifc. If someone
// moves or truncates it the live app silently stops loading, so pin the
// invariants here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath( new URL( '../app/files/ifc/window_wall.ifc', import.meta.url ) );

test( 'autoload fixture exists and is non-trivial', async () => {
	const info = await stat( FIXTURE );
	assert.ok( info.isFile(), 'fixture is a file' );
	assert.ok( info.size > 1024, `fixture is suspiciously small (${ info.size } bytes)` );
} );

test( 'autoload fixture is a STEP-encoded IFC file', async () => {
	const head = ( await readFile( FIXTURE ) ).subarray( 0, 256 ).toString( 'utf8' );
	assert.ok( head.startsWith( 'ISO-10303-21' ), `missing STEP header; got: ${ head.slice( 0, 32 ) }` );
	assert.match( head, /FILE_SCHEMA\s*\(\s*\(\s*'IFC/i );
} );
