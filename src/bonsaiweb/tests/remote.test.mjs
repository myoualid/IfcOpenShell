import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contentUrl, fileNameFromUrl, isHtmlBody, isZipBody, sharedSrc } from '../src/tool/remote.js';

const HOUSE = 'https://raw.githubusercontent.com/aothms/IfcOpenHouse/refs/heads/master/IfcOpenHouse_IFC4.ifc';

test( 'sharedSrc reads one src parameter', () => {

	assert.equal( sharedSrc( `?src=${ encodeURIComponent( HOUSE ) }` ), HOUSE );
	assert.equal( sharedSrc( `?src=${ HOUSE }` ), HOUSE );
	assert.equal( sharedSrc( '' ), '' );

} );

test( 'a plain file URL is left as it is', () => {

	assert.equal( contentUrl( HOUSE ), HOUSE );
	assert.equal( fileNameFromUrl( HOUSE ), 'IfcOpenHouse_IFC4.ifc' );

} );

test( 'a Dropbox file link is fetched from the content host', () => {

	const href = contentUrl( 'https://www.dropbox.com/scl/fi/abc/Site.zip?rlkey=xyz&dl=0' );
	const url = new URL( href );
	assert.equal( url.hostname, 'dl.dropboxusercontent.com' );
	assert.equal( url.pathname, '/scl/fi/abc/Site.zip' );
	assert.equal( url.searchParams.get( 'rlkey' ), 'xyz' );
	assert.equal( url.searchParams.get( 'dl' ), '1' );
	assert.equal( fileNameFromUrl( href ), 'Site.zip' );

} );

test( 'a Dropbox folder link is refused', () => {

	assert.throws(
		() => contentUrl( 'https://www.dropbox.com/scl/fo/abc/Site?rlkey=xyz&dl=0' ),
		/folder link/,
	);

} );

test( 'an HTML page is not a model', () => {

	assert.equal( isHtmlBody( new TextEncoder().encode( '<!DOCTYPE html><html>' ) ), true );
	assert.equal( isHtmlBody( new TextEncoder().encode( 'ISO-10303-21;' ) ), false );
	assert.equal( isZipBody( new Uint8Array( [ 0x50, 0x4b, 0x03, 0x04 ] ) ), true );
	assert.equal( isZipBody( new TextEncoder().encode( 'ISO-10303-21;' ) ), false );

} );
