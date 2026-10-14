import assert from 'node:assert/strict';
import { test } from 'node:test';

import { activateStore, bindStore, createStore, getStore } from '../src/session/store.js';

function fakeSignals() {

	const handlers = { objectPicked: [], modelCleared: [] };
	return {
		objectPicked: { add( fn ) { handlers.objectPicked.push( fn ); } },
		modelCleared: { add( fn ) { handlers.modelCleared.push( fn ); } },
		fire( name, payload ) {

			for ( const fn of handlers[ name ] ) fn( payload );

		},
	};

}

test( 'two sessions do not share selection', () => {

	const a = createStore();
	const b = createStore();
	const sa = fakeSignals();
	const sb = fakeSignals();
	bindStore( a, sa );
	bindStore( b, sb );

	sa.fire( 'objectPicked', { objectId: 1, guid: 'a' } );
	assert.equal( a.selection.guid, 'a' );
	assert.equal( b.selection, null );

	sb.fire( 'modelCleared' );
	assert.equal( a.selection.guid, 'a' );

	activateStore( a );
	assert.equal( getStore(), a );
	activateStore( b );
	assert.equal( getStore(), b );

} );
