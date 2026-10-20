/**
 * Keep peak WASM geometry memory bounded. Large IFCs keep the full parse tree
 * resident, so each tessellation batch must stay small.
 */
export function geometryBatchSize( ifcByteLength ) {

	if ( ifcByteLength >= 512 * 1024 * 1024 ) {

		return 24;

	}

	if ( ifcByteLength >= 128 * 1024 * 1024 ) {

		return 48;

	}

	if ( ifcByteLength >= 32 * 1024 * 1024 ) {

		return 96;

	}

	return 250;

}

/**
 * Geometry dedup key for instancing.
 *
 * Desktop ifcviewer2 keys on IfcGeom representation id (`geom.id()`).
 * When the JS triangulation exposes `id()`, convert.js passes it as
 * `geometryId` and this skips the FNV hash. Otherwise fingerprint local
 * positions + indices + material.
 */
export function meshFingerprint( positions, indices, materialKey, geometryId ) {

	if ( geometryId ) {

		return `${geometryId}:${materialKey}`;

	}

	const positionHash = fnv1aFloats( positions );
	const indexHash = fnv1aInt32s( indices );
	return `${positions.length}:${indices.length}:${positionHash}:${indexHash}:${materialKey}`;

}

export function materialKeyFromRgba( rgba ) {

	return rgba.map( ( value ) => value.toFixed( 4 ) ).join( ',' );

}

function fnv1aFloats( values ) {

	const bits = new Uint32Array( values.buffer, values.byteOffset, values.length );
	let hash = 0x811c9dc5;
	for ( let index = 0; index < values.length; index += 1 ) {

		const value = bits[ index ];
		hash ^= value & 0xff;
		hash = Math.imul( hash, 0x01000193 );
		hash ^= ( value >>> 8 ) & 0xff;
		hash = Math.imul( hash, 0x01000193 );
		hash ^= ( value >>> 16 ) & 0xff;
		hash = Math.imul( hash, 0x01000193 );
		hash ^= ( value >>> 24 ) & 0xff;
		hash = Math.imul( hash, 0x01000193 );

	}

	return ( hash >>> 0 ).toString( 16 );

}

function fnv1aInt32s( values ) {

	let hash = 0x811c9dc5;
	for ( let index = 0; index < values.length; index += 1 ) {

		hash ^= values[ index ] & 0xff;
		hash = Math.imul( hash, 0x01000193 );
		hash ^= ( values[ index ] >>> 8 ) & 0xff;
		hash = Math.imul( hash, 0x01000193 );
		hash ^= ( values[ index ] >>> 16 ) & 0xff;
		hash = Math.imul( hash, 0x01000193 );
		hash ^= ( values[ index ] >>> 24 ) & 0xff;
		hash = Math.imul( hash, 0x01000193 );

	}

	return ( hash >>> 0 ).toString( 16 );

}
