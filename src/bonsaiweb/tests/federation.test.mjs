import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listZipEntries, readZipEntry, writeStoredZip } from '../src/pipeline/zip.js';
import {
	Federation,
	bagFromEntries,
	isStepBytes,
	lookupFile,
	parseIfcfed,
	serializeIfcfed,
	sidecarPath,
	stripSharedRoot,
	textOf,
} from '../src/tool/federation.js';

test( 'stripSharedRoot removes one common folder', () => {

	const stripped = stripSharedRoot( [
		'Site/Site.ifcfed',
		'Site/ARC.ifc',
		'Site/structure/STR.ifc',
	] );
	assert.equal( stripped.root, 'Site' );
	assert.deepEqual( stripped.paths, [
		'Site.ifcfed',
		'ARC.ifc',
		'structure/STR.ifc',
	] );

} );

test( 'stripSharedRoot leaves a flat bag alone', () => {

	const stripped = stripSharedRoot( [ 'Site.ifcfed', 'ARC.ifc' ] );
	assert.equal( stripped.root, '' );
	assert.deepEqual( stripped.paths, [ 'Site.ifcfed', 'ARC.ifc' ] );

} );

test( 'parse and serialize round-trip ifcfed/1', () => {

	const raw = {
		schema: 'ifcfed/1',
		name: 'Site',
		created: '2026-10-20T10:00:00Z',
		modified: '2026-10-20T10:00:00Z',
		config: { unit: { name: 'METRE', prefix: 'MILLI' } },
		federated_false_origin: { xyz: [ 1, 2, 3 ], rz_deg: 12 },
		groups: [ {
			id: 'g1',
			display_name: 'Architecture',
			groups: [ { id: 'g2', display_name: 'Hidden', visible: false } ],
		} ],
		models: [
			{
				id: 'm1',
				display_name: 'ARC.ifc',
				source: { connector: 'local', path: 'ARC.ifc' },
				model_transformation: {
					a_frame: 'ModelLocal',
					a: [ 1, 0, 0 ],
					b: [ 4, 5, 6 ],
					rxyz_deg: [ 0, 0, 90 ],
					pivot: [ 0, 0, 0 ],
				},
				group_id: 'g1',
			},
			{
				id: 'm2',
				display_name: 'Cloud',
				source: { connector: 'autodesk', version_id: 'abc' },
				visible: false,
			},
			{
				id: 'm3',
				display_name: 'Plain.ifc',
				source: { connector: 'local', path: 'Plain.ifc' },
			},
		],
		home_view: { target: [ 0, 0, 1 ], distance: 20, yaw: 10, pitch: 15 },
	};
	const { doc, warnings } = parseIfcfed( JSON.stringify( raw ) );
	assert.deepEqual( warnings, [] );
	assert.equal( doc.unit.prefix, 'MILLI' );
	assert.equal( doc.origin.rzDeg, 12 );
	assert.equal( doc.models[ 0 ].transform.aFrame, 'ModelLocal' );
	assert.equal( doc.models[ 1 ].sourceData.version_id, 'abc' );
	assert.equal( doc.models[ 1 ].connector, 'autodesk' );
	assert.equal( doc.groups[ 0 ].children[ 0 ].visible, false );

	const again = parseIfcfed( serializeIfcfed( doc, raw.modified ) );
	assert.equal( again.doc.models[ 0 ].transform.b[ 0 ], 4 );
	assert.equal( again.doc.models[ 1 ].sourceData.version_id, 'abc' );
	assert.equal( again.doc.models[ 1 ].visible, false );
	assert.equal( again.doc.models[ 2 ].transform, null );
	assert.equal( again.doc.homeView.distance, 20 );
	const saved = JSON.parse( serializeIfcfed( doc, raw.modified ) );
	assert.equal( saved.models[ 2 ].model_transformation, undefined );
	assert.equal( saved.models[ 2 ].visible, undefined );
	assert.equal( saved.models[ 0 ].source.path, 'ARC.ifc' );

} );

test( 'unknown group_id is dropped and a missing path is skipped', () => {

	const { doc, warnings } = parseIfcfed( JSON.stringify( {
		schema: 'nope',
		models: [
			{ id: 'a', source: { connector: 'local', path: 'A.ifc' }, group_id: 'missing' },
			{ id: 'b', source: { connector: 'local' } },
			{ id: 'c', source: { connector: 'local', path: 'nested.ifcfed' } },
		],
	} ) );
	assert.equal( doc.models.length, 1 );
	assert.equal( doc.models[ 0 ].groupId, '' );
	assert.equal( warnings.length, 4 );

} );

test( 'a project zip resolves paths beside the .ifcfed', async () => {

	const fed = new globalThis.TextEncoder().encode( JSON.stringify( {
		schema: 'ifcfed/1',
		name: 'Site',
		models: [ {
			id: 'm1',
			display_name: 'ARC.ifc',
			source: { connector: 'local', path: 'ARC.ifc' },
		} ],
		home_view: null,
	} ) );
	const zip = writeStoredZip( [
		{ name: 'Site/Site.ifcfed', data: fed },
		{ name: 'Site/ARC.ifc', data: new Uint8Array( [ 1, 2, 3 ] ) },
		{ name: 'Site/ARC.ifcview', data: new Uint8Array( [ 4 ] ) },
		{ name: 'Site/__MACOSX/._ARC.ifc', data: new Uint8Array( [ 9 ] ) },
	] );
	const entries = listZipEntries( zip );
	const files = [];
	for ( const entry of entries ) {

		files.push( { path: entry.name, bytes: await readZipEntry( zip, entry ) } );

	}

	const bag = bagFromEntries( files );
	assert.deepEqual( bag.projects, [ 'Site.ifcfed' ] );
	assert.deepEqual( lookupFile( bag.files, 'ARC.ifc' ).bytes, new Uint8Array( [ 1, 2, 3 ] ) );
	assert.equal( sidecarPath( 'ARC.ifc' ), 'ARC.ifcview' );
	assert.ok( lookupFile( bag.files, 'arc.ifcview' ) );
	const parsed = parseIfcfed( textOf( bag.files.get( 'Site.ifcfed' ) ) );
	assert.equal( parsed.doc.models[ 0 ].path, 'ARC.ifc' );

} );

test( 'archiveFiles writes relative names and keeps a model with no bytes', () => {

	Federation.reset();
	const { doc } = parseIfcfed( JSON.stringify( {
		schema: 'ifcfed/1',
		name: 'Site',
		federated_false_origin: { xyz: [ 9, 0, 0 ], rz_deg: 1 },
		models: [
			{ id: 'm1', display_name: 'ARC.ifc', source: { path: 'ARC.ifc' } },
			{ id: 'm2', display_name: 'ARC.ifc', source: { path: 'ARC.ifc' } },
			{ id: 'm3', display_name: 'Gone.ifc', source: { path: 'Gone.ifc' } },
			{ id: 'm4', display_name: 'Cloud', source: { connector: 'autodesk', item: 'x' } },
		],
	} ) );
	Federation.adopt( doc );
	const payload = new Map( [
		[ 'm1', {
			ifc: { name: 'ARC.ifc', data: new Uint8Array( [ 1 ] ) },
			view: { name: 'ARC.ifcview', data: new Uint8Array( [ 2 ] ) },
		} ],
		[ 'm2', {
			ifc: { name: 'ARC.ifc', data: new Uint8Array( [ 3 ] ) },
			view: { name: 'ARC.ifcview', data: new Uint8Array( [ 4 ] ) },
		} ],
	] );
	const archive = Federation.archiveFiles( payload );
	const names = archive.files.map( ( file ) => file.name );
	assert.deepEqual( names, [
		'Site.ifcfed',
		'ARC.ifc',
		'ARC.ifcview',
		'm2/ARC.ifc',
		'm2/ARC.ifcview',
	] );
	assert.equal( archive.warnings.length, 1 );
	const saved = JSON.parse( textOf( archive.files[ 0 ].data ) );
	assert.equal( saved.models[ 1 ].source.path, 'm2/ARC.ifc' );
	assert.equal( saved.models[ 2 ].source.path, 'Gone.ifc' );
	assert.equal( saved.models[ 3 ].source.connector, 'autodesk' );
	assert.equal( saved.models[ 3 ].source.item, 'x' );
	assert.deepEqual( saved.federated_false_origin.xyz, [ 9, 0, 0 ] );
	assert.equal( saved.home_view, null );
	Federation.reset();

} );

test( 'an .ifcview path does not receive the .ifc bytes', () => {

	Federation.reset();
	const { doc } = parseIfcfed( JSON.stringify( {
		schema: 'ifcfed/1',
		name: 'project',
		models: [ {
			id: 'm1',
			display_name: 'Walls.ifcview',
			source: { path: 'Walls.ifcview' },
		} ],
	} ) );
	Federation.adopt( doc );
	const archive = Federation.archiveFiles( new Map( [
		[ 'm1', {
			ifc: { name: 'Walls.ifc', data: new Uint8Array( [ 1, 2 ] ) },
			view: { name: 'Walls.ifcview', data: new Uint8Array( [ 9 ] ) },
		} ],
	] ) );
	assert.deepEqual( archive.files.map( ( file ) => file.name ), [
		'project.ifcfed',
		'Walls.ifc',
		'Walls.ifcview',
	] );
	assert.deepEqual( archive.files[ 1 ].data, new Uint8Array( [ 1, 2 ] ) );
	assert.deepEqual( archive.files[ 2 ].data, new Uint8Array( [ 9 ] ) );
	const saved = JSON.parse( textOf( archive.files[ 0 ].data ) );
	assert.equal( saved.models[ 0 ].source.path, 'Walls.ifc' );
	assert.equal( saved.models[ 0 ].display_name, 'Walls.ifc' );
	assert.equal( isStepBytes( new globalThis.TextEncoder().encode( 'ISO-10303-21;' ) ), true );
	assert.equal( isStepBytes( new Uint8Array( [ 1, 2, 3, 4 ] ) ), false );
	Federation.reset();

} );
