// Terminal display for ifcopenshell values. File and EntityInstance have no
// enumerable fields, so a raw JSON.stringify prints `{}`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatRunOutput } from '../src/modules/code.scripting/core.js';

function ok( value ) {
	return { success: true, value };
}

function entity( id, type, attrs = {} ) {
	return {
		id: () => id,
		isA: () => type,
		attributes: () => Object.keys( attrs ),
		get: ( name ) => attrs[ name ],
	};
}

test( 'a live file prints its schema instead of {}', () => {
	const file = { schema: () => 'IFC4', schemaIdentifier: () => 'IFC4', byGuid() {} };
	assert.equal( formatRunOutput( ok( file ) ), 'IfcFile IFC4' );
} );

test( 'a file nested in a model record stays a schema label', () => {
	const file = { schema: () => 'IFC4', schemaIdentifier: () => 'IFC4', byGuid() {} };
	const text = formatRunOutput( ok( { sourceId: 0, name: 'window_wall.ifc', file } ) );
	assert.equal( JSON.parse( text ).file, 'IfcFile IFC4' );
} );

test( 'byId prints id, type, and attributes, with entity refs as labels', () => {
	const project = entity( 1, 'IfcProject', {
		GlobalId: '2tbn$dMnj6lQIPYFo2aGbK',
		Name: 'My Project',
		RepresentationContexts: [ entity( 14, 'IfcGeometricRepresentationContext' ) ],
		UnitsInContext: entity( 2, 'IfcSIUnit', { UnitType: 'LENGTHUNIT' } ),
	} );

	const printed = JSON.parse( formatRunOutput( ok( project ) ) );
	assert.equal( printed.id, 1 );
	assert.equal( printed.type, 'IfcProject' );
	assert.equal( printed.Name, 'My Project' );
	assert.equal( printed.UnitsInContext, '#2=IfcSIUnit' );
	assert.deepEqual( printed.RepresentationContexts, [ '#14=IfcGeometricRepresentationContext' ] );
} );

test( 'cyclic entity references stop at a label', () => {
	const a = entity( 1, 'IfcLocalPlacement' );
	const b = entity( 2, 'IfcLocalPlacement' );
	a.attributes = () => [ 'PlacementRelTo' ];
	b.attributes = () => [ 'PlacementRelTo' ];
	a.get = () => b;
	b.get = () => a;

	const printed = JSON.parse( formatRunOutput( ok( a ) ) );
	assert.equal( printed.type, 'IfcLocalPlacement' );
	assert.equal( printed.PlacementRelTo, '#2=IfcLocalPlacement' );
} );

test( 'byType prints each entity instead of {}', () => {
	const walls = [
		entity( 1220, 'IfcWall', { GlobalId: '0zCJl$9z9FYg$_PGPY46bd', Name: 'Wall' } ),
		entity( 1247, 'IfcWall', { GlobalId: '3qB$fcoBf6pOy98pdz1eXf', Name: 'Wall' } ),
	];
	const printed = JSON.parse( formatRunOutput( ok( walls ) ) );
	assert.equal( printed.length, 2 );
	assert.equal( printed[ 0 ].type, 'IfcWall' );
	assert.equal( printed[ 0 ].id, 1220 );
	assert.equal( printed[ 1 ].Name, 'Wall' );
} );

test( 'bigint attribute values survive JSON', () => {
	const point = entity( 10, 'IfcCartesianPoint', { Coordinates: [ 0, 1n ] } );
	const printed = JSON.parse( formatRunOutput( ok( point ) ) );
	assert.deepEqual( printed.Coordinates, [ 0, '1' ] );
} );
