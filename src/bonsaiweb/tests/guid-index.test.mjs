// Exercises the STEP-scan guid extractor against the autoload fixture.
// If this ever returns zero guids, selection in the ifc-lite path will
// silently stop resolving to IFC entities.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildExpressIdToGuidMap } from '../src/pipeline/lite/guid-index.js';

const FIXTURE = fileURLToPath(
	new URL( '../app/files/ifc/window_wall.ifc', import.meta.url ),
);

test( 'extracts expressId → GlobalId for every rooted entity in window_wall.ifc', async () => {
	const bytes = await readFile( FIXTURE );
	const map = buildExpressIdToGuidMap( bytes );

	assert.ok( map.size > 0, 'extractor returned zero guids — regex is broken' );

	// window_wall.ifc has 13 products (per the convert worker log). The map
	// also catches non-product rooted entities (owners, materials, …), so
	// comfortably more than product count. 10 is a loose floor.
	assert.ok(
		map.size >= 10,
		`expected many rooted entities, got ${ map.size } — scan may be mis-anchored`,
	);

	// Every emitted guid must be exactly 22 chars from the IFC alphabet.
	for ( const guid of map.values() ) {
		assert.equal( guid.length, 22, `bad guid length: ${ guid }` );
		assert.match( guid, /^[0-9A-Za-z_$]{22}$/, `bad guid chars: ${ guid }` );
	}

	// Round-trip: every id must be a positive integer; no duplicates allowed
	// at the Map level, but check we didn't let the regex emit `#0`.
	for ( const id of map.keys() ) {
		assert.ok( Number.isInteger( id ) && id > 0, `bad express id: ${ id }` );
	}
} );
