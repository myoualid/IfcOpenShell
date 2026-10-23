import assert from 'node:assert/strict';
import { test } from 'node:test';

import { context } from '../src/context/context.js';
import { Signals } from '../src/context/signals.js';
import { store } from '../src/context/store.js';

test( 'store.scene is read-only', () => {

	assert.throws( () => {

		store.scene.background = '#000000';

	}, TypeError );

} );

test( 'context points at the last pick and drops it when models clear', () => {

	store.models.push( { id: 3, name: 'a.ifc', file: null } );
	Signals.objectPicked.dispatch( { objectId: 7, guid: 'g', sourceId: 3 } );
	assert.equal( context.activeObject.guid, 'g' );
	assert.equal( context.activeModel.name, 'a.ifc' );

	Signals.objectPicked.dispatch( { objectId: 0 } );
	assert.equal( context.activeObject, null );

	Signals.objectPicked.dispatch( { objectId: 7, guid: 'g', sourceId: 3 } );
	Signals.modelCleared.dispatch();
	assert.equal( context.activeObject, null );
	store.models.length = 0;

} );

test( 'context reads nothing from the viewer before it exists', () => {

	assert.equal( context.controls, null );
	assert.equal( context.camera, null );
	assert.deepEqual( context.selectedIds, [] );
	assert.equal( store.scene.falseOrigin, null );

} );
