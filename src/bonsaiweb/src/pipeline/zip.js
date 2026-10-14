// Minimal ZIP reader for drag-and-drop bundles. Supports the two
// compression methods a hand-rolled "ifc + ifcview" bundle uses in practice:
// STORE (0) and DEFLATE (8). ZIP64 (files >4GB) is not supported — we throw
// instead of silently reading the wrong offsets.
//
// Why not vendor a zip library: the drop handler needs exactly "give me the
// bytes of these two named entries". fflate / jszip pull in indexing, write
// paths, streaming adapters, etc. — 15–60 KB for one function. Browsers have
// DecompressionStream for the deflate step, so the only thing we need to
// write is the central-directory walker.

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL_HEADER = 0x02014b50;
const SIG_LOCAL_HEADER = 0x04034b50;

const EOCD_MIN_SIZE = 22;
const EOCD_MAX_SIZE = EOCD_MIN_SIZE + 0xffff; // + max comment length

/**
 * @typedef {Object} ZipEntry
 * @property {string} name            file name (zip's native path separators preserved)
 * @property {number} compressionMethod  0=store, 8=deflate
 * @property {number} compressedSize
 * @property {number} uncompressedSize
 * @property {number} localHeaderOffset
 */

function findEocdOffset( view ) {

	// EOCD is at the END of the archive, preceded by an optional comment of
	// up to 65535 bytes. Scan backwards for the signature.
	const start = Math.max( 0, view.byteLength - EOCD_MAX_SIZE );
	for ( let i = view.byteLength - EOCD_MIN_SIZE; i >= start; i -- ) {

		if ( view.getUint32( i, true ) === SIG_EOCD ) return i;

	}

	throw new Error( 'ZIP: End of Central Directory signature not found — not a zip or truncated' );

}

/** Walk the zip's central directory and return every entry. */
export function listZipEntries( bytes ) {

	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	const eocd = findEocdOffset( view );

	const totalEntries = view.getUint16( eocd + 10, true );
	const cdSize = view.getUint32( eocd + 12, true );
	const cdOffset = view.getUint32( eocd + 16, true );

	if ( cdOffset === 0xffffffff || cdSize === 0xffffffff || totalEntries === 0xffff ) {

		throw new Error( 'ZIP64 archives are not supported' );

	}

	const entries = [];
	let p = cdOffset;
	const cdEnd = cdOffset + cdSize;
	for ( let i = 0; i < totalEntries && p < cdEnd; i ++ ) {

		if ( view.getUint32( p, true ) !== SIG_CENTRAL_HEADER ) {

			throw new Error( `ZIP: bad central header at offset ${ p }` );

		}

		const compressionMethod = view.getUint16( p + 10, true );
		const compressedSize = view.getUint32( p + 20, true );
		const uncompressedSize = view.getUint32( p + 24, true );
		const nameLen = view.getUint16( p + 28, true );
		const extraLen = view.getUint16( p + 30, true );
		const commentLen = view.getUint16( p + 32, true );
		const localHeaderOffset = view.getUint32( p + 42, true );
		if (
			compressedSize === 0xffffffff ||
			uncompressedSize === 0xffffffff ||
			localHeaderOffset === 0xffffffff
		) {

			throw new Error( 'ZIP64 extended fields are not supported' );

		}

		const name = new TextDecoder().decode(
			bytes.subarray( p + 46, p + 46 + nameLen ),
		);
		entries.push( {
			name,
			compressionMethod,
			compressedSize,
			uncompressedSize,
			localHeaderOffset,
		} );
		p += 46 + nameLen + extraLen + commentLen;

	}

	return entries;

}

async function inflateRaw( deflated ) {

	// DecompressionStream('deflate-raw') is zlib's "raw" DEFLATE — the format
	// ZIP embeds (no zlib wrapper). Available in Chrome 103+ / Firefox 113+.
	const ds = new DecompressionStream( 'deflate-raw' );
	const stream = new Blob( [ deflated ] ).stream().pipeThrough( ds );
	const buf = await new Response( stream ).arrayBuffer();
	return new Uint8Array( buf );

}

/** Decompress a single entry out of the zip's byte buffer. */
export async function readZipEntry( bytes, entry ) {

	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	const h = entry.localHeaderOffset;
	if ( view.getUint32( h, true ) !== SIG_LOCAL_HEADER ) {

		throw new Error( `ZIP: bad local header for "${ entry.name }" at ${ h }` );

	}

	const nameLen = view.getUint16( h + 26, true );
	const extraLen = view.getUint16( h + 28, true );
	const dataStart = h + 30 + nameLen + extraLen;
	const dataEnd = dataStart + entry.compressedSize;
	const data = bytes.subarray( dataStart, dataEnd );
	if ( entry.compressionMethod === 0 ) return data.slice();
	if ( entry.compressionMethod === 8 ) return inflateRaw( data );
	throw new Error(
		`ZIP: unsupported compression method ${ entry.compressionMethod } for "${ entry.name }" (only STORE and DEFLATE are supported)`,
	);

}

/**
 * Convenience: given a zip and a file-extension predicate, return the
 * decompressed bytes + the entry's path for every match.
 */
export async function readZipEntriesByExtension( bytes, extensionsLower ) {

	const entries = listZipEntries( bytes );
	const wanted = entries.filter( ( e ) => {

		const name = e.name.toLowerCase();
		return extensionsLower.some( ( ext ) => name.endsWith( ext ) );

	} );
	const results = [];
	for ( const entry of wanted ) {

		results.push( { entry, bytes: await readZipEntry( bytes, entry ) } );

	}

	return results;

}

function crc32( data ) {

	let crc = 0xffffffff;
	for ( let i = 0; i < data.length; i ++ ) {

		crc ^= data[ i ];
		for ( let bit = 0; bit < 8; bit ++ ) {

			crc = ( crc >>> 1 ) ^ ( 0xedb88320 & - ( crc & 1 ) );

		}

	}

	return ( crc ^ 0xffffffff ) >>> 0;

}

/** STORE-mode zip of `{ name, data }` files. `data` is a Uint8Array. */
export function writeStoredZip( files ) {

	const encoder = new TextEncoder();
	const localParts = [];
	const centralParts = [];
	let localOffset = 0;

	for ( const file of files ) {

		const nameBytes = encoder.encode( file.name );
		const data = file.data;
		const crc = crc32( data );
		const local = new Uint8Array( 30 + nameBytes.byteLength + data.byteLength );
		const lv = new DataView( local.buffer );
		lv.setUint32( 0, SIG_LOCAL_HEADER, true );
		lv.setUint16( 4, 20, true );
		lv.setUint16( 8, 0, true );
		lv.setUint32( 14, crc, true );
		lv.setUint32( 18, data.byteLength, true );
		lv.setUint32( 22, data.byteLength, true );
		lv.setUint16( 26, nameBytes.byteLength, true );
		local.set( nameBytes, 30 );
		local.set( data, 30 + nameBytes.byteLength );
		localParts.push( local );

		const central = new Uint8Array( 46 + nameBytes.byteLength );
		const cv = new DataView( central.buffer );
		cv.setUint32( 0, SIG_CENTRAL_HEADER, true );
		cv.setUint16( 4, 20, true );
		cv.setUint16( 6, 20, true );
		cv.setUint16( 10, 0, true );
		cv.setUint32( 16, crc, true );
		cv.setUint32( 20, data.byteLength, true );
		cv.setUint32( 24, data.byteLength, true );
		cv.setUint16( 28, nameBytes.byteLength, true );
		cv.setUint32( 42, localOffset, true );
		central.set( nameBytes, 46 );
		centralParts.push( central );
		localOffset += local.byteLength;

	}

	const centralSize = centralParts.reduce( ( sum, part ) => sum + part.byteLength, 0 );
	const eocd = new Uint8Array( 22 );
	const ev = new DataView( eocd.buffer );
	ev.setUint32( 0, SIG_EOCD, true );
	ev.setUint16( 8, files.length, true );
	ev.setUint16( 10, files.length, true );
	ev.setUint32( 12, centralSize, true );
	ev.setUint32( 16, localOffset, true );

	const out = new Uint8Array( localOffset + centralSize + eocd.byteLength );
	let cursor = 0;
	for ( const part of localParts ) {

		out.set( part, cursor );
		cursor += part.byteLength;

	}
	for ( const part of centralParts ) {

		out.set( part, cursor );
		cursor += part.byteLength;

	}
	out.set( eocd, cursor );
	return out;

}
