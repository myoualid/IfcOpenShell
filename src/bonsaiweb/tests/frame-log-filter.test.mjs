// Guards the ifcviewer.js patch that suppresses the per-frame
// '[info] [frame] … fps …' heartbeat. Regenerating ifcviewer.js
// from the C++ build output without re-applying this patch would
// flood the console again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const IFCVIEWER = fileURLToPath( new URL( '../../../build-web/ifcviewer.js', import.meta.url ) );
const VENDOR_IFCVIEWER = fileURLToPath( new URL( '../vendor/@ifcopenshell/viewer/ifcviewer.js', import.meta.url ) );

async function assertFrameFilter( path ) {
	const source = await readFile( path, 'utf8' );
	assert.match( source, /verboseFrames/, 'opt-in flag missing' );
	assert.match( source, /startsWith\(\s*['"`]\[info\] \[frame\]['"`]\s*\)/, 'frame-prefix guard missing' );
}

test( 'ifcviewer.js has the [info] [frame] printErr filter', async () => {
	await assertFrameFilter( IFCVIEWER );
	await assertFrameFilter( VENDOR_IFCVIEWER );
} );

test( 'frame filter logic drops heartbeats but keeps other info/warn lines', () => {
	// Reproduce the filter as it exists in ifcviewer.js so we can unit-test
	// the behavior without loading the half-megabyte wrapper.
	const kept = [];
	function makeFilter( verboseFrames ) {
		return function ( t ) {
			if ( !verboseFrames && typeof t === 'string' && t.startsWith( '[info] [frame]' ) ) return;
			kept.push( t );
		};
	}

	const printErr = makeFilter( false );
	printErr( '[info] [frame] 833.3 fps  1.20 ms  obj 3/3  tri 36' );
	printErr( '[info] stream loaded chunk 42' );
	printErr( '[warn] missing texture' );
	printErr( '[info] [frame] 60.0 fps  16.6 ms' );

	assert.deepEqual( kept, [
		'[info] stream loaded chunk 42',
		'[warn] missing texture',
	] );

	kept.length = 0;
	const verbose = makeFilter( true );
	verbose( '[info] [frame] 60.0 fps  16.6 ms' );
	assert.equal( kept.length, 1, 'verboseFrames=true keeps heartbeats' );
} );
