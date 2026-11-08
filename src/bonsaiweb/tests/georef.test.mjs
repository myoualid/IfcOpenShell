// This file was generated with the assistance of an AI coding tool.
//
// computeModelGeoref (src/pipeline/ifcopenshell/georef.js) must place a local
// point at the same map coordinates as ifcopenshell.util.geolocation
// .auto_xyz2enh. Expected values were computed with IfcOpenShell 0.9.0 (Python)
// on the fixtures next to this file:
//   georef_ifc4_feet_wcs.ifc  IFC4, feet, rotated + offset WCS, IfcMapConversion
//   georef_ifc2x3_pset.ifc    IFC2X3, millimetres, ePSet_MapConversion

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import * as ifcopenshell from 'ifcopenshell';
import { computeModelGeoref } from '../src/pipeline/ifcopenshell/georef.js';

const CASES = [
	{ file: 'georef_ifc4_feet_wcs.ifc', local: [ 250, - 120, 33 ], map: [ 311554.0231644417, 340256.9103961529, 19.0104 ] },
	{ file: 'georef_ifc2x3_pset.ifc', local: [ 12000, - 4500, 3600 ], map: [ 311512.4973235891, 340302.84022941143, 3.6 ] },
];

let ready = null;

async function open( name ) {

	ready ??= ifcopenshell.init().then( async ( runtime ) => {

		for ( const id of [ 'ifc4', 'ifc2x3' ] ) await runtime.loadPlugin( 'schema', id );

	} );
	await ready;
	const bytes = new Uint8Array( await readFile( new URL( name, import.meta.url ) ) );
	return ifcopenshell.open( bytes, name );

}

// Column-major 4x4 times a point in metres.
function apply( m, [ x, y, z ] ) {

	return [ 0, 1, 2 ].map( ( r ) => m[ r ] * x + m[ 4 + r ] * y + m[ 8 + r ] * z + m[ 12 + r ] );

}

for ( const { file, local, map } of CASES ) {

	test( `computeModelGeoref matches util.geolocation for ${ file }`, async () => {

		const ifc = await open( file );
		try {

			const georef = computeModelGeoref( ifc );
			assert.ok( georef, 'expected a coordinate operation' );
			const metres = local.map( ( v ) => v * georef.projectLengthToMeters );
			const got = apply( georef.coordinateOperationMeters, metres );
			for ( let i = 0; i < 3; i ++ ) {

				assert.ok( Math.abs( got[ i ] - map[ i ] ) < 1e-6, `axis ${ i }: ${ got[ i ] } != ${ map[ i ] }` );

			}

		} finally {

			ifc.dispose();

		}

	} );

}

test( 'computeModelGeoref returns null without a coordinate operation', async () => {

	const ifc = await open( 'window_wall.ifc' );
	try {

		assert.equal( computeModelGeoref( ifc ), null );

	} finally {

		ifc.dispose();

	}

} );
