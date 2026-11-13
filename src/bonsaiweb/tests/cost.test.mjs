// This file was generated with the assistance of an AI coding tool.
//
// tool.Cost and the Cost.* operators against Bonsai's cost panel in Python
// (bim/module/cost/data.py on top of ifcopenshell.util.cost, and
// core/cost.py over ifcopenshell.api.cost). cost_5d.ifc and the expected
// values in cost_5d.json come from make_cost_fixture.py.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import * as ifcopenshell from 'ifcopenshell';
import { context } from '../src/context/context.js';
import { store } from '../src/context/store.js';
import costOperators from '../src/modules/bim.cost/operators.js';
import { Ops } from '../src/ops.js';
import { Cost } from '../src/tool/Cost.js';
import { Ifc } from '../src/tool/Ifc.js';

const MODEL_ID = 4;

const expected = JSON.parse( await readFile( new URL( 'cost_5d.json', import.meta.url ), 'utf8' ) );

async function open() {

	const runtime = await ifcopenshell.init();
	await runtime.loadPlugin( 'schema', 'ifc4' );
	const bytes = new Uint8Array( await readFile( new URL( 'cost_5d.ifc', import.meta.url ) ) );
	return ifcopenshell.open( bytes, 'cost_5d.ifc' );

}

const file = await open();
store.models.length = 0;
store.models.push( { id: MODEL_ID, name: 'cost_5d.ifc', file } );

function close( actual, wanted, label ) {

	if ( wanted === null ) assert.equal( actual, null, label );
	else assert.ok( Math.abs( actual - wanted ) < 1e-9, `${ label }: ${ actual } != ${ wanted }` );

}

// One row of tool.Cost against one item of cost_5d.json.
function checkItem( row, item, label ) {

	assert.equal( row.identification, item.identification ?? '', label );
	close( row.quantity, item.quantity, `${ label } quantity` );
	assert.equal( row.unitSymbol, item.unitSymbol, `${ label } unit` );
	close( row.appliedValue, item.appliedValue, `${ label } applied value` );
	close( row.unitBasis, item.unitBasis, `${ label } unit basis` );
	close( row.totalCost, item.totalCost, `${ label } total` );
	assert.equal( row.rateItem?.id ?? null, item.rateItem, `${ label } rate` );
	assert.deepEqual(
		row.values.map( ( value ) => [ value.category, value.formula ] ),
		item.values.map( ( value ) => [ value.category, value.formula ] ),
		`${ label } formulas`,
	);
	row.values.forEach( ( value, i ) => close( value.applied, item.values[ i ].applied, `${ label } value ${ i }` ) );

}

test( 'schedules lists every cost schedule with the project currency', () => {

	assert.deepEqual(
		Cost.schedules().map( ( s ) => [ s.modelId, s.id, s.name, s.predefinedType, s.itemCount, s.currency ] ),
		expected.schedules.map( ( s ) => [ MODEL_ID, s.id, s.name, s.predefinedType, s.items.length, expected.currency ] ),
	);

} );

test( 'itemRows prices every cost item as Bonsai does', () => {

	for ( const schedule of expected.schedules ) {

		const rows = Cost.itemRows( file, Ifc.byId( MODEL_ID, schedule.id, 'IfcCostSchedule' ) );
		assert.deepEqual( rows.map( ( row ) => row.id ), schedule.items.map( ( item ) => item.id ) );

		const parents = new Map();
		for ( const item of schedule.items ) for ( const child of item.nested ) parents.set( child, item.id );

		for ( const [ index, row ] of rows.entries() ) {

			const item = schedule.items[ index ];
			const label = `${ schedule.name } ${ item.identification } ${ item.name }`;
			checkItem( row, item, label );
			assert.equal( row.parentId, parents.get( item.id ) ?? 0, `${ label } parent` );
			assert.equal( row.hasChildren, item.nested.length > 0, `${ label } children` );
			assert.equal( row.productCount, item.products.length, `${ label } products` );

		}

	}

} );

test( 'itemProducts returns assigned elements, deep on request', () => {

	for ( const schedule of expected.schedules ) {

		for ( const item of schedule.items ) {

			const entity = Ifc.byId( MODEL_ID, item.id, 'IfcCostItem' );
			assert.deepEqual( Cost.itemProducts( entity ).sort(), item.products );
			assert.deepEqual( Cost.itemProducts( entity, { deep: true } ).sort(), item.deepProducts );

		}

	}

} );

test( 'productItems matches util.cost.get_cost_items_for_product', () => {

	const bill = expected.schedules.find( ( s ) => s.name === 'Bill' );
	for ( const [ guid, ids ] of Object.entries( expected.products ) ) {

		const items = Cost.productItems( file, Ifc.byGuid( MODEL_ID, guid ) );
		assert.deepEqual( items.map( ( item ) => item.id ).sort( ( a, b ) => a - b ), ids );
		for ( const item of items ) {

			assert.equal( item.scheduleId, bill.id );
			close( item.totalCost, bill.items.find( ( row ) => row.id === item.id ).totalCost, `${ item.name } total` );

		}

	}

} );

test( 'parseFormula follows Bonsai\'s formula grammar', () => {

	assert.deepEqual( Cost.parseFormula( '100' ), { AppliedValue: 100 } );
	assert.deepEqual( Cost.parseFormula( 'SUM()' ), { Category: '*', AppliedValue: null } );
	assert.deepEqual( Cost.parseFormula( 'Labour()+(Material()*1.2)' ), {
		ArithmeticOperator: 'ADD',
		Components: [
			{ Category: 'Labour', AppliedValue: null },
			{ Components: [ { Category: 'Material', AppliedValue: null }, { AppliedValue: 1.2 } ], ArithmeticOperator: 'MULTIPLY' },
		],
	} );
	// Several operators in one formula keep the last one, as in Python.
	assert.equal( Cost.parseFormula( '1+2*3' ).ArithmeticOperator, 'MULTIPLY' );
	assert.throws( () => Cost.parseFormula( 'Labour(' ), /not closed/ );
	assert.throws( () => Cost.parseFormula( '3 4' ) );
	assert.throws( () => Cost.parseFormula( 'abc' ), /needs brackets/ );

} );

test( 'authoring through the Cost operators ends where ifcopenshell.api does in Python', async () => {

	const AUTHOR_ID = 5;
	const model = await open();
	store.models.push( { id: AUTHOR_ID, name: 'authoring.ifc', file: model } );
	const ops = new Ops();
	for ( const Op of costOperators ) ops.register( Op );
	const changes = [];
	const onChange = ( change ) => changes.push( change );
	context.signals.scheduleChanged.add( onChange );
	const wallGuid = ( name ) => model.byType( 'IfcWall' ).find( ( wall ) => wall.Name === name ).GlobalId;
	const rate = model.byType( 'IfcCostItem' ).find( ( item ) => item.Name === 'Kerb per 2 m' ).id();
	const finished = ( result ) => assert.equal( result?.status, 'FINISHED', result?.message );
	const valueOf = () => ops.Cost.ItemDetails().result.values[ 0 ].id;

	try {

		context.cost = { model: AUTHOR_ID, schedule: 0, item: 0 };
		finished( ops.Cost.AddCostSchedule( { name: 'Tender', predefinedType: 'COSTPLAN' } ) );
		const tender = context.cost.schedule;
		finished( ops.Cost.EditCostSchedule( { Name: 'Tender pricing' } ) );
		finished( ops.Cost.AddCostItem( { name: 'Works', identification: 'T' } ) );
		const works = context.cost.item;
		finished( ops.Cost.AddValue( { type: 'SUM' } ) );

		finished( ops.Cost.AddCostItem( { placement: 'child', name: 'Concrete', identification: 'T.1' } ) );
		finished( ops.Cost.AddQuantity( { ifcClass: 'IfcQuantityVolume', value: 12.5 } ) );
		finished( ops.Cost.AddValue( { type: 'FIXED', value: 0 } ) );
		finished( ops.Cost.EditValueFormula( valueOf(), '100+20.5' ) );
		assert.equal( ( await ops.Cost.AssignProducts( { guids: [ wallGuid( 'Wall 1' ), wallGuid( 'Wall 2' ) ] } ) ).result, 2 );
		finished( await ops.Cost.UnassignProducts( { guids: [ wallGuid( 'Wall 2' ) ] } ) );

		finished( ops.Cost.AddCostItem( { name: 'Kerbs', identification: 'T.2' } ) );
		finished( ops.Cost.AddQuantity( { ifcClass: 'IfcQuantityLength', value: 40 } ) );
		finished( ops.Cost.AssignRate( rate ) );

		finished( ops.Cost.AddCostItem( { name: 'Doors', identification: 'T.3' } ) );
		const doors = context.cost.item;
		finished( ops.Cost.AddQuantity( { ifcClass: 'IfcQuantityCount', value: 3 } ) );
		finished( ops.Cost.AddValue( { type: 'FIXED', value: 450 } ) );
		finished( ops.Cost.EditValueFormula( valueOf(), 'Material(300)+Labour(150)' ) );

		finished( ops.Cost.AddCostItem( { name: 'Temporary' } ) );
		finished( ops.Cost.RemoveCostItem() );
		assert.equal( context.cost.item, works, 'removing the active item activates its parent' );
		ops.Cost.Activate( { item: doors } );
		const area = ops.Cost.AddQuantity( { ifcClass: 'IfcQuantityArea', value: 2 } ).result;
		finished( ops.Cost.RemoveQuantity( area ) );
		const extras = ops.Cost.AddValue( { type: 'CATEGORY', category: 'Extras' } ).result;
		finished( ops.Cost.RemoveValue( extras ) );
		const budget = model.byType( 'IfcCostSchedule' ).find( ( s ) => s.Name === 'Budget' ).id();
		finished( ops.Cost.RemoveCostSchedule( { schedule: budget } ) );
		assert.equal( context.cost.schedule, tender, 'removing another schedule keeps the active one' );

		const want = expected.authoring;
		assert.deepEqual( model.byType( 'IfcCostSchedule' ).map( ( s ) => s.Name ).sort(), want.schedules );
		const rows = ops.Cost.Items().result;
		assert.deepEqual( rows.map( ( row ) => row.name ), want.items.map( ( item ) => item.name ) );
		for ( const [ index, row ] of rows.entries() ) {

			const item = want.items[ index ];
			checkItem( row, item, item.name );
			const names = Cost.itemProducts( Ifc.byId( AUTHOR_ID, row.id, 'IfcCostItem' ) ).map( ( guid ) => Ifc.byGuid( AUTHOR_ID, guid ).Name ).sort();
			assert.deepEqual( names, item.productNames, `${ item.name } elements` );

		}

		assert.ok( changes.length > 0 && changes.every( ( change ) => change.module === 'cost' && change.modelId === AUTHOR_ID ) );
		const bad = ops.Cost.EditValueFormula( valueOf(), 'Labour(' );
		assert.equal( bad.status, 'CANCELLED' );
		assert.match( bad.message, /not closed/ );
		assert.equal( ops.Cost.CheckFormula( 'Labour()+Material()*1.2' ).status, 'FINISHED' );
		assert.match( ops.Cost.CheckFormula( 'Labour(' ).message, /not closed/ );
		assert.equal( ops.Cost.AddValue( { type: 'CATEGORY' } ).status, 'CANCELLED', 'a category value needs a category' );
		assert.equal( ops.Cost.AssignRate( doors ).status, 'CANCELLED' );

	} finally {

		context.signals.scheduleChanged.remove( onChange );
		context.cost = undefined;

	}

} );

test( 'Cost.Activate, AddCostItem placement and toggles go through signals', () => {

	const ops = new Ops();
	for ( const Op of costOperators ) ops.register( Op );
	const activated = [];
	const toggled = [];
	const onActivated = ( change ) => activated.push( change );
	const onToggled = ( request ) => toggled.push( request );
	context.signals.scheduleActivated.add( onActivated );
	context.signals.panelToggled.add( onToggled );

	try {

		const bill = expected.schedules.find( ( s ) => s.name === 'Bill' );
		const substructure = bill.items.find( ( item ) => item.name === 'Substructure' ).id;
		context.cost = {};
		ops.Cost.Activate( { model: MODEL_ID, schedule: bill.id, item: substructure, show: true } );
		assert.deepEqual( context.cost, { model: MODEL_ID, schedule: bill.id, item: substructure } );
		assert.deepEqual( activated.at( - 1 ), { module: 'cost' } );
		assert.deepEqual( toggled.at( - 1 ), { id: 'cost-panel', show: true } );

		const parentOf = ( id ) => Ifc.byId( MODEL_ID, id, 'IfcCostItem' ).Nests[ 0 ].RelatingObject.id();
		ops.Cost.AddCostItem( { placement: 'child' } );
		assert.equal( parentOf( context.cost.item ), substructure );
		ops.Cost.AddCostItem( { placement: 'sibling' } );
		assert.equal( parentOf( context.cost.item ), substructure );

		toggled.length = 0;
		ops.Cost.Toggle();
		ops.Cost.ToggleElement();
		assert.deepEqual( toggled.map( ( request ) => request.id ), [ 'cost-panel', 'cost-element-panel' ] );

	} finally {

		context.signals.scheduleActivated.remove( onActivated );
		context.signals.panelToggled.remove( onToggled );
		context.cost = undefined;

	}

} );
