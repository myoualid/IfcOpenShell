// Verifies the drag-drop zip reader against a hand-built STORE-mode zip.
// We skip DEFLATE in this file because Node's DecompressionStream path
// doesn't match the browser's `deflate-raw` support surface across all
// supported Node versions; the browser is where that branch actually runs.
// STORE coverage is enough to prove the central-directory walker and the
// per-entry offset arithmetic work — the deflate path is a straight
// pipeThrough on top.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listZipEntries, readZipEntry, writeStoredZip } from '../src/pipeline/zip.js';

const LOCAL_HEADER_SIG   = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const EOCD_SIG           = 0x06054b50;

/**
 * Hand-roll a minimal, correctly-shaped STORE-mode zip with the given
 * files. Keeps the test independent of any zip builder dependency.
 */
function buildStoreZip( files ) {
	const encoder = new TextEncoder();
	const localParts = [];
	const centralParts = [];
	let localOffset = 0;

	for ( const [ name, contentBytes ] of files ) {
		const nameBytes = encoder.encode( name );
		const dataLen = contentBytes.byteLength;

		// Local file header: 30 bytes + filename
		const local = new Uint8Array( 30 + nameBytes.byteLength + dataLen );
		const lv = new DataView( local.buffer );
		lv.setUint32(  0, LOCAL_HEADER_SIG, true );
		lv.setUint16(  4, 20, true );            // version needed
		lv.setUint16(  6, 0, true );             // flags
		lv.setUint16(  8, 0, true );             // compression: STORE
		lv.setUint16( 10, 0, true );             // mod time
		lv.setUint16( 12, 0, true );             // mod date
		lv.setUint32( 14, 0, true );             // crc32 (ignored by reader)
		lv.setUint32( 18, dataLen, true );       // compressed size
		lv.setUint32( 22, dataLen, true );       // uncompressed size
		lv.setUint16( 26, nameBytes.byteLength, true ); // name len
		lv.setUint16( 28, 0, true );             // extra len
		local.set( nameBytes, 30 );
		local.set( contentBytes, 30 + nameBytes.byteLength );
		localParts.push( local );

		// Central directory file header: 46 bytes + filename
		const central = new Uint8Array( 46 + nameBytes.byteLength );
		const cv = new DataView( central.buffer );
		cv.setUint32(  0, CENTRAL_HEADER_SIG, true );
		cv.setUint16(  4, 20, true );            // version made
		cv.setUint16(  6, 20, true );            // version needed
		cv.setUint16(  8, 0, true );             // flags
		cv.setUint16( 10, 0, true );             // compression: STORE
		cv.setUint16( 12, 0, true );             // mod time
		cv.setUint16( 14, 0, true );             // mod date
		cv.setUint32( 16, 0, true );             // crc32
		cv.setUint32( 20, dataLen, true );       // compressed size
		cv.setUint32( 24, dataLen, true );       // uncompressed size
		cv.setUint16( 28, nameBytes.byteLength, true );
		cv.setUint16( 30, 0, true );             // extra len
		cv.setUint16( 32, 0, true );             // comment len
		cv.setUint16( 34, 0, true );             // disk start
		cv.setUint16( 36, 0, true );             // internal attrs
		cv.setUint32( 38, 0, true );             // external attrs
		cv.setUint32( 42, localOffset, true );   // local header offset
		central.set( nameBytes, 46 );
		centralParts.push( central );

		localOffset += local.byteLength;
	}

	const localSize = localParts.reduce( ( n, p ) => n + p.byteLength, 0 );
	const centralSize = centralParts.reduce( ( n, p ) => n + p.byteLength, 0 );

	// EOCD: 22 bytes
	const eocd = new Uint8Array( 22 );
	const ev = new DataView( eocd.buffer );
	ev.setUint32(  0, EOCD_SIG, true );
	ev.setUint16(  4, 0, true );                 // disk
	ev.setUint16(  6, 0, true );                 // disk w/ CD
	ev.setUint16(  8, files.length, true );      // entries on disk
	ev.setUint16( 10, files.length, true );      // total entries
	ev.setUint32( 12, centralSize, true );       // CD size
	ev.setUint32( 16, localSize, true );         // CD offset
	ev.setUint16( 20, 0, true );                 // comment length

	const out = new Uint8Array( localSize + centralSize + 22 );
	let p = 0;
	for ( const b of localParts )   { out.set( b, p ); p += b.byteLength; }
	for ( const b of centralParts ) { out.set( b, p ); p += b.byteLength; }
	out.set( eocd, p );
	return out;
}

test( 'listZipEntries walks the central directory in order', () => {
	const files = [
		[ 'model.ifc',     new TextEncoder().encode( 'ISO-10303-21;\nHEADER;' ) ],
		[ 'model.ifcview', new Uint8Array( [ 0x89, 'I'.charCodeAt( 0 ), 'F'.charCodeAt( 0 ), 'C' ] ) ],
		[ 'nested/other.txt', new TextEncoder().encode( 'bystander' ) ],
	];
	const zip = buildStoreZip( files );
	const entries = listZipEntries( zip );
	assert.equal( entries.length, 3 );
	assert.deepEqual( entries.map( ( e ) => e.name ), [ 'model.ifc', 'model.ifcview', 'nested/other.txt' ] );
	for ( const e of entries ) {
		assert.equal( e.compressionMethod, 0, `${ e.name }: expected STORE` );
		assert.ok( e.compressedSize > 0, `${ e.name }: zero size` );
		assert.equal( e.compressedSize, e.uncompressedSize );
	}
} );

test( 'readZipEntry extracts STORE-mode bytes verbatim', async () => {
	const ifcSrc     = new TextEncoder().encode( 'ISO-10303-21;\nHEADER;\nENDSEC;' );
	const sidecarSrc = new Uint8Array( [ 0, 1, 2, 3, 0xff, 0xfe, 0xfd ] );
	const zip = buildStoreZip( [
		[ 'bundle/model.ifc',     ifcSrc     ],
		[ 'bundle/model.ifcview', sidecarSrc ],
	] );
	const entries = listZipEntries( zip );
	const [ ifcEntry, viewEntry ] = entries;

	const ifcOut = await readZipEntry( zip, ifcEntry );
	const viewOut = await readZipEntry( zip, viewEntry );

	assert.deepEqual( Array.from( ifcOut ),  Array.from( ifcSrc ),  'ifc bytes round-trip' );
	assert.deepEqual( Array.from( viewOut ), Array.from( sidecarSrc ), 'ifcview bytes round-trip' );
} );

test( 'writeStoredZip round-trips an ifc and ifcview pair', async () => {
	const ifcSrc = new TextEncoder().encode( 'ISO-10303-21;' );
	const viewSrc = new Uint8Array( [ 9, 8, 7 ] );
	const zip = writeStoredZip( [
		{ name: 'house.ifc', data: ifcSrc },
		{ name: 'house.ifcview', data: viewSrc },
	] );
	const entries = listZipEntries( zip );
	assert.deepEqual( entries.map( ( entry ) => entry.name ), [ 'house.ifc', 'house.ifcview' ] );
	assert.deepEqual( Array.from( await readZipEntry( zip, entries[ 0 ] ) ), Array.from( ifcSrc ) );
	assert.deepEqual( Array.from( await readZipEntry( zip, entries[ 1 ] ) ), Array.from( viewSrc ) );
} );

test( 'rejects ZIP64 markers rather than reading wrong offsets', () => {
	// Build a legit zip, then clobber the EOCD's "total entries" to the
	// ZIP64 sentinel so the walker trips the guard.
	const zip = buildStoreZip( [ [ 'a.txt', new TextEncoder().encode( 'hi' ) ] ] );
	// Last 22 bytes = EOCD; "total entries" is at offset +10 from EOCD start.
	const eocdStart = zip.byteLength - 22;
	const view = new DataView( zip.buffer, zip.byteOffset, zip.byteLength );
	view.setUint16( eocdStart + 10, 0xffff, true );
	assert.throws( () => listZipEntries( zip ), /ZIP64/ );
} );
