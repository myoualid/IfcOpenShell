const IFVW_MAGIC = [ 0x49, 0x46, 0x56, 0x57 ]; // "IFVW"
const ZIP_MAGIC = [ 0x50, 0x4b ]; // "PK"
const IFC_SPF_PREFIX = 'ISO-10303-21';
function matchesMagic( bytes, magic, offset = 0 ) {

	if ( bytes.length < offset + magic.length ) {

		return false;

	}

	for ( let index = 0; index < magic.length; index += 1 ) {

		if ( bytes[ offset + index ] !== magic[ index ] ) {

			return false;

		}

	}

	return true;

}

function readAsciiPrefix( bytes, maxLength ) {

	const length = Math.min( bytes.length, maxLength );
	let text = '';
	for ( let index = 0; index < length; index += 1 ) {

		text += String.fromCharCode( bytes[ index ] ?? 0 );

	}

	return text;

}

function extensionOf( filename ) {

	const dot = filename.lastIndexOf( '.' );
	if ( dot < 0 ) {

		return '';

	}

	return filename.slice( dot ).toLowerCase();

}

/**
 * Detect format from filename and leading bytes.
 * Extension is a hint; magic bytes take precedence when they disagree.
 */
export function detectFormat( bytes, filename ) {

	const extension = extensionOf( filename );
	if ( matchesMagic( bytes, IFVW_MAGIC ) ) {

		return 'ifcview';

	}

	if ( matchesMagic( bytes, ZIP_MAGIC ) ) {

		return 'rdbview';

	}

	const prefix = readAsciiPrefix( bytes, 128 ).trimStart();
	if ( prefix.startsWith( IFC_SPF_PREFIX ) ) {

		return 'ifc-spf';

	}

	switch ( extension ) {

		case '.ifc':
			return 'ifc-spf';
		case '.ifcview':
			return 'ifcview';
		default:
			return 'unknown';

	}

}

export function formatLabel( format ) {

	switch ( format ) {

		case 'ifc-spf':
			return 'IFC SPF';
		case 'ifcview':
			return 'IFC sidecar (.ifcview)';
		case 'rdbview':
			return 'RDBView bundle (.rdbview)';
		default:
			return 'unknown format';

	}

}
