import { SIDECAR_VERTEX_STRIDE } from './types.js';
/** Pack normalized RGBA into a uint32 matching GeometryStreamer::packRGBA8 (little-endian [r,g,b,a]). */
export function packRgba8( r, g, b, a = 255 ) {

	return ( r | ( g << 8 ) | ( b << 16 ) | ( a << 24 ) ) >>> 0;

}

/** Pack a 0xRRGGBB hex color with optional alpha for WASM vertex colors. */
export function rgbColor( rgb, a = 255 ) {

	return packRgba8( ( rgb >> 16 ) & 0xff, ( rgb >> 8 ) & 0xff, rgb & 0xff, a );

}

/** Extract 0xRRGGBB for color pickers from a packed rgba8 value. */
export function rgba8ToPickerHex( rgba8 ) {

	const r = rgba8 & 0xff;
	const g = ( rgba8 >> 8 ) & 0xff;
	const b = ( rgba8 >> 16 ) & 0xff;
	return ( r << 16 ) | ( g << 8 ) | b;

}

/** Merge picker hex + alpha back into packed rgba8. */
export function pickerHexToRgba8( hex, alpha ) {

	return rgbColor( hex & 0xffffff, alpha & 0xff );

}

export function rgba8FromFloats( rgba ) {

	const clampByte = ( value ) => {

		const clamped = Math.min( 1, Math.max( 0, value ) );
		return Math.min( 255, Math.floor( clamped * 255 + 0.5 ) );

	};

	const r = clampByte( rgba[ 0 ] );
	const g = clampByte( rgba[ 1 ] );
	const b = clampByte( rgba[ 2 ] );
	const a = clampByte( rgba[ 3 ] );
	return packRgba8( r, g, b, a );

}

/** Write packed RGBA into the streamer vertex color slot without float reinterpretation loss. */
export function writeColorFloatSlot( out, floatIndex, rgba ) {

	const rgba8 = rgba8FromFloats( rgba );
	const colorBytes = new Uint8Array( out.buffer, out.byteOffset + floatIndex * 4, 4 );
	colorBytes[ 0 ] = rgba8 & 0xff;
	colorBytes[ 1 ] = ( rgba8 >> 8 ) & 0xff;
	colorBytes[ 2 ] = ( rgba8 >> 16 ) & 0xff;
	colorBytes[ 3 ] = ( rgba8 >> 24 ) & 0xff;

}

/** Read RGBA8 bytes from a streamer vertex color slot (0–255). */
export function readColorFloatSlot( out, floatIndex ) {

	const colorBytes = new Uint8Array( out.buffer, out.byteOffset + floatIndex * 4, 4 );
	return [ colorBytes[ 0 ], colorBytes[ 1 ], colorBytes[ 2 ], colorBytes[ 3 ] ];

}

/** Meyer et al. octahedral normal encode (matches ifcviewer2 VertexQuantization.h). */
export function octEncodeNormal( nx, ny, nz ) {

	const ax = Math.abs( nx );
	const ay = Math.abs( ny );
	const az = Math.abs( nz );
	const denom = ax + ay + az;
	if ( denom < 1e-12 ) {

		return [ 0, 0 ];

	}

	let px = nx / denom;
	let py = ny / denom;
	if ( nz < 0 ) {

		const sx = px >= 0 ? 1 : - 1;
		const sy = py >= 0 ? 1 : - 1;
		px = ( 1 - Math.abs( py ) ) * sx;
		py = ( 1 - Math.abs( px ) ) * sy;

	}

	return [ px, py ];

}

function writeU16LE( out, byteOffset, value ) {

	out[ byteOffset ] = value & 0xff;
	out[ byteOffset + 1 ] = ( value >>> 8 ) & 0xff;

}

function writeI8( out, byteOffset, value ) {

	out[ byteOffset ] = value & 0xff;

}

export function quantizeSidecarVertex( position, normal, rgba, aabbMin, extentRecip, out, byteOffset ) {

	for ( let axis = 0; axis < 3; axis += 1 ) {

		let t = ( position[ axis ] - aabbMin[ axis ] ) * extentRecip[ axis ];
		if ( t < 0 ) {

			t = 0;

		} else if ( t > 1 ) {

			t = 1;

		}

		writeU16LE( out, byteOffset + axis * 2, Math.round( t * 65535 ) );

	}

	const ax = Math.abs( normal[ 0 ] );
	const ay = Math.abs( normal[ 1 ] );
	const az = Math.abs( normal[ 2 ] );
	const denom = ax + ay + az;
	let octX = 0;
	let octY = 0;
	if ( denom >= 1e-12 ) {

		octX = normal[ 0 ] / denom;
		octY = normal[ 1 ] / denom;
		if ( normal[ 2 ] < 0 ) {

			const sx = octX >= 0 ? 1 : - 1;
			const sy = octY >= 0 ? 1 : - 1;
			const foldedX = ( 1 - Math.abs( octY ) ) * sx;
			octY = ( 1 - Math.abs( octX ) ) * sy;
			octX = foldedX;

		}

	}

	writeI8( out, byteOffset + 6, Math.round( clamp( octX, - 1, 1 ) * 127 ) );
	writeI8( out, byteOffset + 7, Math.round( clamp( octY, - 1, 1 ) * 127 ) );
	out[ byteOffset + 8 ] = Math.round( clamp( rgba[ 0 ], 0, 1 ) * 255 );
	out[ byteOffset + 9 ] = Math.round( clamp( rgba[ 1 ], 0, 1 ) * 255 );
	out[ byteOffset + 10 ] = Math.round( clamp( rgba[ 2 ], 0, 1 ) * 255 );
	out[ byteOffset + 11 ] = Math.round( clamp( rgba[ 3 ], 0, 1 ) * 255 );

}

/** Dequantize one 12-byte sidecar vertex into position + normal (world-local mesh coords). */
export function dequantSidecarVertex( vertices, byteOffset, aabbMin, aabbMax, positions, normals, vertexIndex ) {

	const view = new DataView( vertices.buffer, vertices.byteOffset + byteOffset, SIDECAR_VERTEX_STRIDE );
	const posOut = vertexIndex * 3;
	for ( let axis = 0; axis < 3; axis += 1 ) {

		const t = view.getUint16( axis * 2, true ) / 65535;
		positions[ posOut + axis ] = aabbMin[ axis ] + t * ( aabbMax[ axis ] - aabbMin[ axis ] );

	}

	const octX = view.getInt8( 6 ) / 127;
	const octY = view.getInt8( 7 ) / 127;
	let nx = octX;
	let ny = octY;
	let nz = 1 - Math.abs( octX ) - Math.abs( octY );
	if ( nz < 0 ) {

		const signX = nx >= 0 ? 1 : - 1;
		const signY = ny >= 0 ? 1 : - 1;
		nx = ( 1 - Math.abs( ny ) ) * signX;
		ny = ( 1 - Math.abs( nx ) ) * signY;
		nz = 1 - Math.abs( octX ) - Math.abs( octY );

	}

	const len = Math.hypot( nx, ny, nz ) || 1;
	normals[ posOut ] = nx / len;
	normals[ posOut + 1 ] = ny / len;
	normals[ posOut + 2 ] = nz / len;

}

/** Read RGBA8 color from vertex bytes (0–1). */
export function readSidecarVertexColor( vertices, byteOffset ) {

	const base = vertices.byteOffset + byteOffset + 8;
	return [
		vertices[ base ] / 255,
		vertices[ base + 1 ] / 255,
		vertices[ base + 2 ] / 255,
		vertices[ base + 3 ] / 255
	];

}

function clamp( value, min, max ) {

	return Math.min( max, Math.max( min, value ) );

}
