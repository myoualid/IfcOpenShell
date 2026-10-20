import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveNumThreads, resolveThread } from '../src/pipeline/thread.js';

test( 'auto converts in a worker', () => {

	assert.equal( resolveThread( 'auto' ), 'worker' );

} );

test( 'explicit thread wins', () => {

	assert.equal( resolveThread( 'main' ), 'main' );
	assert.equal( resolveThread( 'worker' ), 'worker' );

} );

test( 'unknown thread throws', () => {

	assert.throws( () => resolveThread( 'pool' ), /unknown convert thread/ );

} );

test( 'numThreads is 1 when the runtime has no thread support, even if requested', () => {

	const coi = { crossOriginIsolated: true, navigator: { hardwareConcurrency: 16 } };
	assert.equal( resolveNumThreads( undefined, {} ), 1 );
	assert.equal( resolveNumThreads( undefined, coi ), 1 );
	assert.equal( resolveNumThreads( 4, coi ), 1 );
	assert.equal( resolveNumThreads( 4, {}, true ), 1 );

} );

test( 'numThreads follows cores up to 8 with thread support and isolation', () => {

	const coi = { crossOriginIsolated: true, navigator: { hardwareConcurrency: 16 } };
	assert.equal( resolveNumThreads( undefined, coi, true ), 8 );
	assert.equal( resolveNumThreads( 4, coi, true ), 4 );
	assert.equal( resolveNumThreads( 64, coi, true ), 8 );

} );
