// This file was generated with the assistance of an AI coding tool.
//
// tool.Cost against Bonsai's cost panel in Python (bim/module/cost/data.py
// on top of ifcopenshell.util.cost). cost_5d.ifc and the expected values in
// cost_5d.json come from make_cost_fixture.py.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import * as ifcopenshell from 'ifcopenshell';
import { store } from '../src/context/store.js';
import { Cost } from '../src/tool/Cost.js';

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

test( 'schedules lists every cost schedule with the project currency', async () => {

	const schedules = await Cost.schedules();
	assert.deepEqual(
		schedules.map( ( s ) => [ s.modelId, s.id, s.name, s.predefinedType, s.itemCount, s.currency ] ),
		expected.schedules.map( ( s ) => [ MODEL_ID, s.id, s.name, s.predefinedType, s.items.length, expected.currency ] ),
	);

} );

test( 'items price every cost item as Bonsai does', async () => {

	for ( const schedule of expected.schedules ) {

		const rows = await Cost.items( MODEL_ID, schedule.id );
		assert.deepEqual( rows.map( ( row ) => row.id ), schedule.items.map( ( item ) => item.id ) );

		const parents = new Map();
		for ( const item of schedule.items ) for ( const child of item.nested ) parents.set( child, item.id );

		for ( const [ index, row ] of rows.entries() ) {

			const item = schedule.items[ index ];
			const label = `${ schedule.name } ${ item.identification } ${ item.name }`;
			assert.equal( row.identification, item.identification ?? '', label );
			close( row.quantity, item.quantity, `${ label } quantity` );
			assert.equal( row.unitSymbol, item.unitSymbol, `${ label } unit` );
			close( row.appliedValue, item.appliedValue, `${ label } applied value` );
			close( row.unitBasis, item.unitBasis, `${ label } unit basis` );
			close( row.totalCost, item.totalCost, `${ label } total` );
			assert.equal( row.rateItem?.id ?? null, item.rateItem, `${ label } rate` );
			assert.equal( row.parentId, parents.get( item.id ) ?? 0, `${ label } parent` );
			assert.equal( row.hasChildren, item.nested.length > 0, `${ label } children` );
			assert.equal( row.productCount, item.products.length, `${ label } products` );
			assert.deepEqual(
				row.values.map( ( value ) => [ value.category, value.formula ] ),
				item.values.map( ( value ) => [ value.category, value.formula ] ),
				`${ label } formulas`,
			);
			row.values.forEach( ( value, i ) => close( value.applied, item.values[ i ].applied, `${ label } value ${ i }` ) );

		}

	}

} );

test( 'itemProducts returns assigned elements, deep on request', async () => {

	for ( const schedule of expected.schedules ) {

		for ( const item of schedule.items ) {

			assert.deepEqual( ( await Cost.itemProducts( MODEL_ID, item.id ) ).sort(), item.products );
			assert.deepEqual( ( await Cost.itemProducts( MODEL_ID, item.id, { deep: true } ) ).sort(), item.deepProducts );

		}

	}

} );

test( 'productItems matches util.cost.get_cost_items_for_product', async () => {

	const bill = expected.schedules.find( ( s ) => s.name === 'Bill' );
	for ( const [ guid, ids ] of Object.entries( expected.products ) ) {

		const items = await Cost.productItems( MODEL_ID, guid );
		assert.deepEqual( items.map( ( item ) => item.id ).sort( ( a, b ) => a - b ), ids );
		for ( const item of items ) {

			assert.equal( item.scheduleId, bill.id );
			const want = bill.items.find( ( row ) => row.id === item.id );
			close( item.totalCost, want.totalCost, `${ want.name } total` );

		}

	}

} );

test( 'unknown models, ids and GlobalIds return empty results', async () => {

	assert.deepEqual( await Cost.items( 99, 1 ), [] );
	assert.deepEqual( await Cost.items( MODEL_ID, 999999 ), [] );
	assert.deepEqual( await Cost.itemProducts( MODEL_ID, 999999 ), [] );
	assert.deepEqual( await Cost.productItems( MODEL_ID, 'not-a-guid' ), [] );
	assert.equal( Cost.currency( 99 ), '' );

} );
