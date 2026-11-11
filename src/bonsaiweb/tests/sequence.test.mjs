// This file was generated with the assistance of an AI coding tool.
//
// tool.Sequence against ifcopenshell.util.sequence in Python. sequence_4d.ifc
// and the expected values in sequence_4d.json come from
// make_sequence_fixture.py.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import * as ifcopenshell from 'ifcopenshell';
import { store } from '../src/context/store.js';
import { Sequence } from '../src/tool/Sequence.js';

const MODEL_ID = 7;

const expected = JSON.parse( await readFile( new URL( 'sequence_4d.json', import.meta.url ), 'utf8' ) );

async function open() {

	const runtime = await ifcopenshell.init();
	await runtime.loadPlugin( 'schema', 'ifc4' );
	const bytes = new Uint8Array( await readFile( new URL( 'sequence_4d.ifc', import.meta.url ) ) );
	return ifcopenshell.open( bytes, 'sequence_4d.ifc' );

}

const file = await open();
store.models.length = 0;
store.models.push( { id: MODEL_ID, name: 'sequence_4d.ifc', file } );

test( 'schedules lists every work schedule with its task count', async () => {

	const schedules = await Sequence.schedules();
	assert.deepEqual(
		schedules.map( ( s ) => [ s.modelId, s.id, s.name, s.taskCount ] ),
		expected.schedules.map( ( s ) => [ MODEL_ID, s.id, s.name, s.tasks.length ] ),
	);

} );

test( 'tasks walks the tree in util.sequence order with derived dates', async () => {

	for ( const schedule of expected.schedules ) {

		const rows = await Sequence.tasks( MODEL_ID, schedule.id );
		assert.deepEqual( rows.map( ( row ) => row.id ), schedule.tasks.map( ( task ) => task.id ) );

		const parents = new Map();
		for ( const task of schedule.tasks ) for ( const child of task.nested ) parents.set( child, task.id );

		for ( const [ index, row ] of rows.entries() ) {

			const task = schedule.tasks[ index ];
			assert.equal( row.name, task.name );
			assert.equal( row.identification, task.identification );
			assert.equal( row.start, task.start, `${ task.name } start` );
			assert.equal( row.finish, task.finish, `${ task.name } finish` );
			assert.equal( row.hasChildren, task.nested.length > 0 );
			assert.equal( row.parentId, parents.get( task.id ) ?? 0 );
			assert.equal( row.outputCount, task.outputs.length );
			assert.equal( row.inputCount, task.inputs.length );

		}

	}

} );

test( 'task rows carry milestone, critical, derived and readable duration', async () => {

	const rows = await Sequence.tasks( MODEL_ID, expected.schedules[ 0 ].id );
	const byName = Object.fromEntries( rows.map( ( row ) => [ row.name, row ] ) );

	assert.equal( byName.Handover.isMilestone, true );
	assert.equal( byName.Excavation.isCritical, true );
	assert.equal( byName.Walls.isCritical, false );
	assert.equal( byName.Shell.derived, true );
	assert.equal( byName.Walls.derived, false );
	assert.equal( byName.Excavation.duration, '5D' );
	assert.equal( byName.Roof.duration, '2W' );
	assert.equal( byName.Snagging.start, null );
	assert.equal( byName.Construction.depth, 0 );
	assert.equal( byName.Excavation.depth, 2 );

} );

test( 'taskProducts returns outputs and inputs, recursively on request', async () => {

	for ( const task of expected.schedules[ 0 ].tasks ) {

		const own = await Sequence.taskProducts( MODEL_ID, task.id );
		assert.deepEqual( own.outputs.sort(), task.outputs );
		assert.deepEqual( own.inputs.sort(), task.inputs );

		const deep = await Sequence.taskProducts( MODEL_ID, task.id, { recursive: true } );
		assert.deepEqual( deep.outputs.sort(), task.deepOutputs );

	}

} );

test( 'productTasks matches util.sequence.get_tasks_for_product', async () => {

	for ( const [ guid, want ] of Object.entries( expected.products ) ) {

		const got = await Sequence.productTasks( MODEL_ID, guid );
		assert.deepEqual( got.inputs.map( ( task ) => task.id ).sort( ( a, b ) => a - b ), want.inputs );
		assert.deepEqual( got.outputs.map( ( task ) => task.id ).sort( ( a, b ) => a - b ), want.outputs );
		for ( const task of [ ...got.inputs, ...got.outputs ] ) {

			assert.equal( task.schedule, 'Construction' );
			assert.equal( task.scheduleId, expected.schedules[ 0 ].id );

		}

	}

} );

test( 'unknown models, ids and GlobalIds return empty results', async () => {

	assert.deepEqual( await Sequence.tasks( 99, 1 ), [] );
	assert.deepEqual( await Sequence.tasks( MODEL_ID, 999999 ), [] );
	assert.deepEqual( await Sequence.taskProducts( MODEL_ID, 999999 ), { outputs: [], inputs: [] } );
	assert.deepEqual( await Sequence.productTasks( MODEL_ID, 'not-a-guid' ), { outputs: [], inputs: [] } );

} );
