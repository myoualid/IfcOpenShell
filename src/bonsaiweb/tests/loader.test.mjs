// Tests for Loader drag and drop: event handling and how a drop is turned
// into a payload. No wasm, no browser: DOM targets and DataTransfer are mocked.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { Loader } from '../src/tool/Loader.js';
import { DROPBOX_DRAG_TYPE } from '../src/modules/dropbox/const.js';

// ---- Helpers --------------------------------------------------------

function createTarget() {

	const listeners = {};
	const classes = new Set();
	return {
		listeners,
		classes,
		addEventListener( evt, fn ) {

			listeners[ evt ] = fn;

		},
		classList: {
			toggle( name, on ) {

				if ( on ) classes.add( name );
				else classes.delete( name );

			},
		},
	};

}

function createEvent( dataTransfer = null ) {

	const ev = { dataTransfer, prevented: false, stopped: false };
	ev.preventDefault = () => {

		ev.prevented = true;

	};

	ev.stopPropagation = () => {

		ev.stopped = true;

	};

	return ev;

}

function fakeFile( name, text = 'x' ) {

	const bytes = new TextEncoder().encode( text );
	return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer };

}

function fileEntry( name, text ) {

	return { isFile: true, isDirectory: false, name, file: ( resolve ) => resolve( fakeFile( name, text ) ) };

}

function dirEntry( name, children ) {

	return {
		isFile: false,
		isDirectory: true,
		name,
		createReader() {

			let done = false;
			return {
				readEntries( resolve ) {

					const batch = done ? [] : children;
					done = true;
					resolve( batch );

				},
			};

		},
	};

}

function itemsTransfer( entries ) {

	return {
		getData: () => '',
		items: entries.map( ( entry ) => ( { webkitGetAsEntry: () => entry } ) ),
		files: [],
	};

}

let savedWindow;

beforeEach( () => {

	savedWindow = globalThis.window;
	const listeners = {};
	globalThis.window = {
		listeners,
		addEventListener( evt, fn ) {

			listeners[ evt ] = fn;

		},
	};

} );

afterEach( () => {

	if ( savedWindow === undefined ) delete globalThis.window;
	else globalThis.window = savedWindow;

} );

// ---- enableDragDrop -------------------------------------------------

test( 'dragover and dragenter prevent default so drop can fire', () => {

	const target = createTarget();
	Loader.enableDragDrop( target, () => {} );
	for ( const evt of [ 'dragover', 'dragenter' ] ) {

		const ev = createEvent();
		target.listeners[ evt ]( ev );
		assert.equal( ev.prevented, true, `${ evt } must preventDefault` );

	}

} );

test( 'window handlers keep a stray drop from navigating the page', () => {

	Loader.enableDragDrop( createTarget(), () => {} );
	const over = createEvent();
	const drop = createEvent();
	window.listeners.dragover( over );
	window.listeners.drop( drop );
	assert.equal( over.prevented, true );
	assert.equal( drop.prevented, true );

} );

test( 'window handlers are installed once across several targets', () => {

	Loader.enableDragDrop( createTarget(), () => {} );
	const first = window.listeners.dragover;
	Loader.enableDragDrop( createTarget(), () => {} );
	assert.equal( window.listeners.dragover, first );

} );

test( 'drop hands the collected file to the callback', async () => {

	const target = createTarget();
	const got = [];
	Loader.enableDragDrop( target, ( payload ) => got.push( payload ) );
	const file = fakeFile( 'model.ifc' );
	await target.listeners.drop( createEvent( { getData: () => '', items: [], files: [ file ] } ) );
	assert.deepEqual( got, [ { file } ] );

} );

test( 'drop with nothing in it does not call back', async () => {

	const target = createTarget();
	const got = [];
	Loader.enableDragDrop( target, ( payload ) => got.push( payload ) );
	await target.listeners.drop( createEvent( null ) );
	await target.listeners.drop( createEvent( { getData: () => '', items: [], files: [] } ) );
	assert.equal( got.length, 0 );

} );

// ---- collectDrop ----------------------------------------------------

test( 'a Dropbox marker becomes a dropbox payload', async () => {

	const marker = JSON.stringify( { path: '/a/model.ifc', name: 'model.ifc' } );
	const payload = await Loader.collectDrop( {
		getData: ( type ) => ( type === DROPBOX_DRAG_TYPE ? marker : '' ),
		items: [],
		files: [],
	} );
	assert.deepEqual( payload, { dropbox: { path: '/a/model.ifc', name: 'model.ifc' } } );

} );

test( 'a malformed Dropbox marker falls back to the dropped file', async () => {

	const file = fakeFile( 'model.ifc' );
	const payload = await Loader.collectDrop( {
		getData: ( type ) => ( type === DROPBOX_DRAG_TYPE ? '{not json' : '' ),
		items: [],
		files: [ file ],
	} );
	assert.deepEqual( payload, { file } );

} );

test( 'one walked file stays a single model drop', async () => {

	const payload = await Loader.collectDrop( itemsTransfer( [ fileEntry( 'a.ifc' ) ] ) );
	assert.equal( payload.file.name, 'a.ifc' );

} );

test( 'several files keep only the loadable formats', async () => {

	const payload = await Loader.collectDrop( itemsTransfer( [
		fileEntry( 'a.ifc' ), fileEntry( 'b.ifcview' ), fileEntry( 'notes.txt' ), fileEntry( 'c.glb' ),
	] ) );
	assert.deepEqual( payload.files.map( ( f ) => f.name ), [ 'a.ifc', 'b.ifcview', 'c.glb' ] );

} );

test( 'a folder with an .ifcfed becomes a project bag with relative paths', async () => {

	const payload = await Loader.collectDrop( itemsTransfer( [
		dirEntry( 'site', [ fileEntry( 'site.ifcfed', '{}' ), dirEntry( 'models', [ fileEntry( 'a.ifc' ) ] ) ] ),
	] ) );
	assert.equal( payload.label, 'site.ifcfed' );
	assert.deepEqual( payload.entries.map( ( e ) => e.path ), [ 'site/site.ifcfed', 'site/models/a.ifc' ] );
	assert.ok( payload.entries.every( ( e ) => e.bytes instanceof Uint8Array ) );

} );
