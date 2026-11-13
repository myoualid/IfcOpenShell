// This file was generated with the assistance of an AI coding tool.
//
// tool.Sequence and the Sequence.* operators against ifcopenshell in
// Python. sequence_4d.ifc and the expected values in sequence_4d.json come
// from make_sequence_fixture.py.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import * as ifcopenshell from 'ifcopenshell';
import { context } from '../src/context/context.js';
import { store } from '../src/context/store.js';
import sequenceOperators from '../src/modules/bim.sequence/operators.js';
import { Ops } from '../src/ops.js';
import { Ifc } from '../src/tool/Ifc.js';
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

const schedule = ( id ) => Ifc.byId( MODEL_ID, id, 'IfcWorkSchedule' );
const task = ( id ) => Ifc.byId( MODEL_ID, id, 'IfcTask' );

test( 'schedules lists every work schedule with its task count', () => {

	assert.deepEqual(
		Sequence.schedules().map( ( s ) => [ s.modelId, s.id, s.name, s.taskCount ] ),
		expected.schedules.map( ( s ) => [ MODEL_ID, s.id, s.name, s.tasks.length ] ),
	);

} );

test( 'taskRows walks the tree in util.sequence order with derived dates', () => {

	for ( const want of expected.schedules ) {

		const rows = Sequence.taskRows( schedule( want.id ) );
		assert.deepEqual( rows.map( ( row ) => row.id ), want.tasks.map( ( t ) => t.id ) );

		const parents = new Map();
		for ( const t of want.tasks ) for ( const child of t.nested ) parents.set( child, t.id );

		for ( const [ index, row ] of rows.entries() ) {

			const t = want.tasks[ index ];
			assert.equal( row.name, t.name );
			assert.equal( row.identification, t.identification );
			assert.equal( row.start, t.start, `${ t.name } start` );
			assert.equal( row.finish, t.finish, `${ t.name } finish` );
			assert.equal( row.hasChildren, t.nested.length > 0 );
			assert.equal( row.parentId, parents.get( t.id ) ?? 0 );
			assert.equal( row.outputCount, t.outputs.length );
			assert.equal( row.inputCount, t.inputs.length );

		}

	}

} );

test( 'task rows carry milestone, critical, derived and readable duration', () => {

	const rows = Sequence.taskRows( schedule( expected.schedules[ 0 ].id ) );
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

test( 'taskProducts returns outputs and inputs, recursively on request', () => {

	for ( const t of expected.schedules[ 0 ].tasks ) {

		const own = Sequence.taskProducts( task( t.id ) );
		assert.deepEqual( own.outputs.sort(), t.outputs );
		assert.deepEqual( own.inputs.sort(), t.inputs );
		assert.deepEqual( Sequence.taskProducts( task( t.id ), { recursive: true } ).outputs.sort(), t.deepOutputs );

	}

} );

test( 'productTasks matches util.sequence.get_tasks_for_product', () => {

	for ( const [ guid, want ] of Object.entries( expected.products ) ) {

		const got = Sequence.productTasks( Ifc.byGuid( MODEL_ID, guid ) );
		assert.deepEqual( got.inputs.map( ( t ) => t.id ).sort( ( a, b ) => a - b ), want.inputs );
		assert.deepEqual( got.outputs.map( ( t ) => t.id ).sort( ( a, b ) => a - b ), want.outputs );
		for ( const t of [ ...got.inputs, ...got.outputs ] ) {

			assert.equal( t.schedule, 'Construction' );
			assert.equal( t.scheduleId, expected.schedules[ 0 ].id );

		}

	}

} );

test( 'tool.Ifc lookups return null for unknown models, ids, classes and GlobalIds', () => {

	assert.equal( Ifc.byId( 99, 1 ), null );
	assert.equal( Ifc.byId( MODEL_ID, 999999 ), null );
	assert.equal( Ifc.byId( MODEL_ID, expected.schedules[ 0 ].id, 'IfcTask' ), null );
	assert.equal( Ifc.byGuid( MODEL_ID, 'not-a-guid' ), null );

} );

test( 'authoring through the Sequence operators ends where ifcopenshell.api does in Python', async () => {

	const AUTHOR_ID = 8;
	const model = await open();
	store.models.push( { id: AUTHOR_ID, name: 'authoring.ifc', file: model } );
	const ops = new Ops();
	for ( const Op of sequenceOperators ) ops.register( Op );
	const changes = [];
	const onChange = ( change ) => changes.push( change );
	context.signals.scheduleChanged.add( onChange );
	const taskNamed = ( name ) => model.byType( 'IfcTask' ).find( ( t ) => t.Name === name ).id();
	const wallGuid = ( name ) => model.byType( 'IfcWall' ).find( ( wall ) => wall.Name === name ).GlobalId;
	const finished = ( result ) => assert.equal( result?.status, 'FINISHED', result?.message );

	try {

		context.sequence = { model: AUTHOR_ID, schedule: 0, task: 0 };
		finished( ops.Sequence.AddWorkSchedule( { name: 'Fit-out 2', predefinedType: 'PLANNED' } ) );
		const plan = context.sequence.schedule;
		finished( ops.Sequence.EditWorkSchedule( { Name: 'Interiors' } ) );
		finished( ops.Sequence.AddTask( { name: 'Partitions', identification: 'F' } ) );
		const partitions = context.sequence.task;
		finished( ops.Sequence.AddTask( { parent: partitions, name: 'Studs', identification: 'F.1' } ) );
		const studs = context.sequence.task;
		finished( ops.Sequence.AddTask( { parent: partitions, name: 'Boards', identification: 'F.2' } ) );
		const boards = context.sequence.task;

		context.sequence.task = studs;
		finished( ops.Sequence.EditTask( { Status: 'STARTED', PredefinedType: 'CONSTRUCTION' } ) );
		finished( ops.Sequence.EditTaskTime( { ScheduleStart: '2024-04-01T09:00:00', ScheduleDuration: 'P3D' } ) );
		finished( ops.Sequence.EditTaskTime( { ScheduleStart: '2024-04-08T09:00:00', ScheduleFinish: '2024-04-10T17:00:00' }, { task: boards } ) );
		finished( ops.Sequence.AssignPredecessor( studs, { task: boards } ) );
		finished( ops.Sequence.EditTaskTime( { ScheduleDuration: 'P5D' } ) );
		assert.equal( ( await ops.Sequence.AssignProducts( { guids: [ wallGuid( 'Wall 4' ), wallGuid( 'Wall 3' ) ] } ) ).result, 2 );
		finished( await ops.Sequence.UnassignProducts( { guids: [ wallGuid( 'Wall 3' ) ] } ) );
		finished( await ops.Sequence.AssignProducts( { kind: 'inputs', guids: [ wallGuid( 'Wall 1' ) ], task: boards } ) );

		finished( ops.Sequence.AddTask( { parent: partitions, name: 'Temporary' } ) );
		finished( ops.Sequence.RemoveTask() );
		assert.equal( context.sequence.task, partitions, 'removing the active task activates its parent' );
		finished( ops.Sequence.EditTask( { IsMilestone: false }, { task: taskNamed( 'Handover' ) } ) );
		const fitOut = model.byType( 'IfcWorkSchedule' ).find( ( s ) => s.Name === 'Fit-out' ).id();
		finished( ops.Sequence.RemoveWorkSchedule( { schedule: fitOut } ) );
		assert.equal( context.sequence.schedule, plan, 'removing another schedule keeps the active one' );

		const want = expected.authoring;
		assert.deepEqual( model.byType( 'IfcWorkSchedule' ).map( ( s ) => s.Name ).sort(), want.schedules );
		const rows = ops.Sequence.Tasks().result;
		assert.deepEqual( rows.map( ( row ) => row.name ), want.tasks.map( ( t ) => t.name ) );
		for ( const t of want.tasks ) {

			const details = ops.Sequence.TaskDetails( { task: taskNamed( t.name ) } ).result;
			assert.equal( details.identification, t.identification ?? '', t.name );
			assert.equal( details.status, t.status ?? '', `${ t.name } status` );
			assert.equal( details.predefinedType, t.predefinedType ?? '', `${ t.name } type` );
			assert.equal( details.time?.scheduleStart ?? null, t.start, `${ t.name } start` );
			assert.equal( details.time?.scheduleFinish ?? null, t.finish, `${ t.name } finish` );
			assert.equal( details.time?.scheduleDuration ?? null, t.duration, `${ t.name } duration` );
			assert.deepEqual( details.predecessors.map( ( link ) => link.name ), t.predecessors, `${ t.name } predecessors` );
			assert.deepEqual( details.outputs.map( ( product ) => product.name ).sort(), t.outputs, `${ t.name } outputs` );
			assert.deepEqual( details.inputs.map( ( product ) => product.name ).sort(), t.inputs, `${ t.name } inputs` );

		}

		assert.equal( ops.Sequence.TaskDetails( { task: taskNamed( 'Handover' ) } ).result.isMilestone, want.handoverIsMilestone );
		assert.ok( changes.length > 0 && changes.every( ( change ) => change.module === 'sequence' && change.modelId === AUTHOR_ID ) );

		const self = ops.Sequence.AssignPredecessor( studs, { task: studs } );
		assert.equal( self.status, 'CANCELLED' );
		assert.match( self.message, /cannot precede itself/ );
		assert.equal( ops.Sequence.EditTask( { Name: 'x' }, { task: plan } ).status, 'CANCELLED', 'a schedule is not a task' );

	} finally {

		context.signals.scheduleChanged.remove( onChange );
		context.sequence = undefined;

	}

} );

test( 'Activate, AddTask placement and toggles go through signals', () => {

	const ops = new Ops();
	for ( const Op of sequenceOperators ) ops.register( Op );
	const activated = [];
	const toggled = [];
	const onActivated = ( change ) => activated.push( change );
	const onToggled = ( request ) => toggled.push( request );
	context.signals.scheduleActivated.add( onActivated );
	context.signals.panelToggled.add( onToggled );

	try {

		const construction = expected.schedules[ 0 ];
		const shell = construction.tasks.find( ( t ) => t.name === 'Shell' ).id;
		context.sequence = {};
		ops.Sequence.Activate( { model: MODEL_ID, schedule: construction.id, task: shell, show: true } );
		assert.deepEqual( context.sequence, { model: MODEL_ID, schedule: construction.id, task: shell } );
		assert.deepEqual( activated.at( - 1 ), { module: 'sequence' } );
		assert.deepEqual( toggled.at( - 1 ), { id: 'sequence-panel', show: true } );

		const parentOf = ( id ) => Ifc.byId( MODEL_ID, id, 'IfcTask' ).Nests[ 0 ].RelatingObject.id();
		ops.Sequence.AddTask( { placement: 'child', name: 'Child of shell' } );
		assert.equal( parentOf( context.sequence.task ), shell );
		ops.Sequence.AddTask( { placement: 'sibling', name: 'Next to the child' } );
		assert.equal( parentOf( context.sequence.task ), shell );
		ops.Sequence.Activate( { task: construction.roots[ 0 ] } );
		ops.Sequence.AddTask( { name: 'Second root' } );
		assert.ok( Ifc.byId( MODEL_ID, context.sequence.task, 'IfcTask' ).HasAssignments.some( ( rel ) => rel.isA( 'IfcRelAssignsToControl' ) ), 'a sibling of a root task is a root task' );

		toggled.length = 0;
		ops.Sequence.Toggle();
		ops.Sequence.ToggleTasks();
		assert.deepEqual( toggled.map( ( request ) => request.id ), [ 'sequence-panel', 'sequence-tasks-panel' ] );

	} finally {

		context.signals.scheduleActivated.remove( onActivated );
		context.signals.panelToggled.remove( onToggled );
		context.sequence = undefined;

	}

} );
