import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	Measure,
	cameraRay,
	dist3,
	pickOnWorkPlane,
	polygonArea,
	projectPoint,
	readVolumes,
	resolvePick,
	triArea3,
} from '../src/tool/measure.js';

function canvas( width = 200, height = 200 ) {

	return {
		clientWidth: width,
		clientHeight: height,
		getBoundingClientRect() {

			return { width, height, left: 0, top: 0 };

		},
	};

}

function camera() {

	const eye = [ 0, - 10, 10 ];
	const target = [ 0, 0, 0 ];
	return {
		eye,
		target,
		distance: Math.hypot( 10, 10 ),
		pitch: 45,
		yaw: 90,
		ortho: false,
	};

}

test( 'two points report distance and axis deltas', () => {

	const tool = new Measure();
	tool.setMode( 'length' );
	tool.add( { point: [ 0, 0, 0 ], placement: 'surface' } );
	const state = tool.add( { point: [ 3, 4, 0 ], placement: 'surface' } );
	assert.equal( state.lines[ 0 ], 'Length: 5.0000 m' );
	assert.match( state.lines[ 1 ], /ΔX: 3\.0000/ );
	assert.match( state.lines[ 1 ], /ΔY: 4\.0000/ );
	assert.equal( state.segments[ 0 ].label, '5.000 m' );

} );

test( 'three points report the angle at the middle vertex', () => {

	const tool = new Measure();
	tool.setMode( 'length' );
	tool.add( { point: [ 1, 0, 0 ] } );
	tool.add( { point: [ 0, 0, 0 ] } );
	const state = tool.add( { point: [ 0, 1, 0 ] } );
	assert.equal( state.lines[ 0 ], 'Angle at point 2: 90.00°' );
	assert.equal( triArea3( [ 1, 0, 0 ], [ 0, 0, 0 ], [ 0, 1, 0 ] ), 0.5 );

} );

test( 'a planar square is one square metre', () => {

	const square = [ [ 0, 0, 0 ], [ 1, 0, 0 ], [ 1, 1, 0 ], [ 0, 1, 0 ] ];
	assert.equal( polygonArea( square ).area, 1 );
	assert.equal( polygonArea( square ).method, 'planar' );
	const tool = new Measure();
	tool.setMode( 'area' );
	let state;
	for ( const point of square ) state = tool.add( { point } );
	assert.equal( state.lines[ 0 ], 'Area: 1.0000 m²' );
	assert.equal( state.segments.length, 4 );

} );

test( 'area patches from the viewer sum instead of forming a polygon', () => {

	const tool = new Measure();
	tool.setMode( 'area' );
	tool.add( { point: [ 0, 0, 0 ], area: 1.5, placement: 'surface' } );
	const state = tool.add( { point: [ 1, 0, 0 ], area: 0.25, placement: 'surface' } );
	assert.equal( state.lines[ 0 ], 'Area: 1.7500 m²  (2 patches)' );
	tool.undo();
	assert.equal( tool.snapshot().lines[ 0 ], 'Area: 1.5000 m²  (1 patch)' );

} );

test( 'volume uses the viewer export when the build has one', () => {

	const api = {
		getSelection() { return [ 4, 9 ]; },
		volumeOf() { return 2.5; },
	};
	assert.deepEqual( readVolumes( api ), { total: 2.5, count: 2, source: 'viewer' } );
	const tool = new Measure();
	tool.setMode( 'volume' );
	const state = tool.syncVolume( api );
	assert.equal( state.lines[ 0 ], 'Volume: 2.5000 m³  (2 objects)' );

} );

test( 'a centre click lands on the camera target', () => {

	const api = { canvas: canvas(), getCamera: camera };
	const hit = pickOnWorkPlane( api, 100, 100 );
	assert.ok( hit );
	assert.ok( dist3( hit.point, [ 0, 0, 0 ] ) < 1e-6 );
	assert.equal( hit.placement, 'plane' );
	const ray = cameraRay( camera(), api.canvas, 100, 100 );
	assert.ok( Math.abs( ray.dir[ 0 ] ) < 1e-9 );

} );

test( 'pickSurface wins over the work plane', async () => {

	const api = {
		canvas: canvas(),
		getCamera: camera,
		pickSurface() { return { point: [ 8, 0, 2 ], normal: [ 0, 0, 1 ] }; },
	};
	const hit = await resolvePick( api, { x: 10, y: 10 } );
	assert.deepEqual( hit.point, [ 8, 0, 2 ] );
	assert.equal( hit.placement, 'surface' );

} );

test( 'projected points round-trip through the orbit camera', () => {

	const api = { canvas: canvas(), getCamera: camera };
	const screen = projectPoint( api, [ 0, 0, 0 ] );
	assert.ok( Math.abs( screen.x - 100 ) < 1e-6 );
	assert.ok( Math.abs( screen.y - 100 ) < 1e-6 );
	const again = pickOnWorkPlane( api, screen.x, screen.y );
	assert.ok( dist3( again.point, [ 0, 0, 0 ] ) < 1e-6 );

} );

test( 'turning a mode on again is how the operator leaves it', () => {

	const tool = new Measure();
	tool.setMode( 'length' );
	tool.add( { point: [ 1, 2, 3 ] } );
	tool.setMode( 'area' );
	assert.equal( tool.snapshot().points.length, 0 );
	tool.setMode( null );
	assert.equal( tool.mode(), null );

} );
