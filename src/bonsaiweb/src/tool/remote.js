// A `?src=` link is one file the page fetches and opens. A Dropbox share
// page does not answer a cross-origin fetch; the content host does.

const DROPBOX_PAGE = new Set( [ 'www.dropbox.com', 'dropbox.com', 'dl.dropboxusercontent.com' ] );

export function contentUrl( input, base ) {

	const url = new URL( input, base );
	const host = url.hostname.toLowerCase();
	if ( ! DROPBOX_PAGE.has( host ) ) return url.href;
	if ( url.pathname.includes( '/scl/fo/' ) ) {

		throw new Error( 'A Dropbox folder link is not a file. Share the zip file.' );

	}

	url.hostname = 'dl.dropboxusercontent.com';
	url.protocol = 'https:';
	url.searchParams.set( 'dl', '1' );
	return url.href;

}

export function sharedSrc( search = '' ) {

	const value = new URLSearchParams( search ).get( 'src' );
	return value?.trim() ?? '';

}

export function fileNameFromUrl( href ) {

	try {

		const name = decodeURIComponent( new URL( href ).pathname.split( '/' ).pop() || '' );
		return name || 'model';

	} catch {

		return 'model';

	}

}

export function isHtmlBody( bytes ) {

	const head = new TextDecoder().decode( bytes.subarray( 0, 64 ) ).trimStart().toLowerCase();
	return head.startsWith( '<!doctype' ) || head.startsWith( '<html' ) || head.startsWith( '<head' );

}

export function isZipBody( bytes ) {

	return bytes.length >= 2 && bytes[ 0 ] === 0x50 && bytes[ 1 ] === 0x4b;

}

export async function fetchSharedFile( raw, base ) {

	const href = contentUrl( raw, base );
	const response = await fetch( href, { credentials: 'omit', redirect: 'follow' } );
	if ( ! response.ok ) throw new Error( `Could not download the link: ${ response.status }` );
	const bytes = new Uint8Array( await response.arrayBuffer() );
	const name = fileNameFromUrl( href );
	if ( isHtmlBody( bytes ) ) throw new Error( 'The link returned a web page, not the file.' );
	if ( name.toLowerCase().endsWith( '.zip' ) && ! isZipBody( bytes ) ) {

		throw new Error( 'The link did not return a zip.' );

	}

	return new File( [ bytes ], name );

}
