import { INSTANCE_CPU_BYTE_LENGTH, MESH_INFO_BYTE_LENGTH, PACKED_ELEMENT_BYTE_LENGTH, SIDECAR_CHUNK_BYTE_LENGTH, SIDECAR_ENDIAN, SIDECAR_MAGIC, SIDECAR_VERTEX_STRIDE, VIEWER_SIDECAR_FORMAT_VERSION } from './types.js';
import { reorderSidecarByMorton } from './chunk-planner.js';
import { concatByteChunks, SidecarByteBuilder } from './byte-builder.js';
import { compressSidecarBlock } from './compress.js';
function writeMeshInfo( view, offset, mesh ) {

	view.setUint32( offset, mesh.vboByteOffset, true );
	view.setUint32( offset + 4, mesh.vertexCount, true );
	view.setUint32( offset + 8, mesh.eboByteOffset, true );
	view.setUint32( offset + 12, mesh.indexCount, true );
	view.setFloat32( offset + 16, mesh.localAabbMin[ 0 ], true );
	view.setFloat32( offset + 20, mesh.localAabbMin[ 1 ], true );
	view.setFloat32( offset + 24, mesh.localAabbMin[ 2 ], true );
	view.setFloat32( offset + 28, mesh.localAabbMax[ 0 ], true );
	view.setFloat32( offset + 32, mesh.localAabbMax[ 1 ], true );
	view.setFloat32( offset + 36, mesh.localAabbMax[ 2 ], true );
	view.setUint32( offset + 40, mesh.firstInstance, true );
	view.setUint32( offset + 44, mesh.instanceCount, true );
	view.setUint32( offset + 48, mesh.lod1EboByteOffset, true );
	view.setUint32( offset + 52, mesh.lod1IndexCount, true );

}

function writeInstanceCpu( view, offset, instance ) {

	const p = instance.placementTransformation;
	view.setUint32( offset, instance.meshId, true );
	view.setUint32( offset + 4, instance.objectId, true );
	view.setFloat64( offset + 8, p[ 12 ] ?? 0, true );
	view.setFloat64( offset + 16, p[ 13 ] ?? 0, true );
	view.setFloat64( offset + 24, p[ 14 ] ?? 0, true );
	const linear = [ 0, 1, 2, 4, 5, 6, 8, 9, 10 ];
	for ( let i = 0; i < linear.length; i += 1 ) {

		view.setFloat32( offset + 32 + i * 4, p[ linear[ i ] ] ?? 0, true );

	}

}

function extractChunkGeometry( data, chunk ) {

	const vertexParts = [];
	const indexParts = [];
	const end = chunk.firstMesh + chunk.meshCount;
	for ( let meshIndex = chunk.firstMesh; meshIndex < end && meshIndex < data.meshes.length; meshIndex += 1 ) {

		const mesh = data.meshes[ meshIndex ];
		const vertexByteCount = mesh.vertexCount * SIDECAR_VERTEX_STRIDE;
		if ( vertexByteCount > 0 ) {

			vertexParts.push( data.vertices.subarray( mesh.vboByteOffset, mesh.vboByteOffset + vertexByteCount ) );

		}

	}

	for ( let meshIndex = chunk.firstMesh; meshIndex < end && meshIndex < data.meshes.length; meshIndex += 1 ) {

		const mesh = data.meshes[ meshIndex ];
		if ( mesh.indexCount > 0 ) {

			const wordStart = mesh.eboByteOffset / 4;
			const indexSlice = data.indices.subarray( wordStart, wordStart + mesh.indexCount );
			indexParts.push( new Uint8Array( indexSlice.buffer, indexSlice.byteOffset, indexSlice.byteLength ) );

		}

	}

	for ( let meshIndex = chunk.firstMesh; meshIndex < end && meshIndex < data.meshes.length; meshIndex += 1 ) {

		const mesh = data.meshes[ meshIndex ];
		if ( mesh.lod1IndexCount > 0 ) {

			const wordStart = mesh.lod1EboByteOffset / 4;
			const indexSlice = data.indices.subarray( wordStart, wordStart + mesh.lod1IndexCount );
			indexParts.push( new Uint8Array( indexSlice.buffer, indexSlice.byteOffset, indexSlice.byteLength ) );

		}

	}

	return { vertices: concatByteChunks( vertexParts ), indices: concatByteChunks( indexParts ) };

}

function appendVecMeshOrInstance( builder, elementSize, writer, values ) {

	builder.appendU32( values.length );
	if ( values.length === 0 ) {

		return;

	}

	const bytes = new Uint8Array( elementSize * values.length );
	const view = new DataView( bytes.buffer );
	for ( let i = 0; i < values.length; i += 1 ) {

		writer( view, i * elementSize, values[ i ] );

	}

	builder.append( bytes );

}

function buildGeometryMetadataRaw( data, chunks ) {

	const builder = new SidecarByteBuilder();
	appendVecMeshOrInstance( builder, MESH_INFO_BYTE_LENGTH, writeMeshInfo, data.meshes );
	appendVecMeshOrInstance( builder, INSTANCE_CPU_BYTE_LENGTH, writeInstanceCpu, data.instances );
	builder.appendU32( data.georef.hasCoordinateOperation ? 1 : 0 );
	for ( let i = 0; i < 16; i += 1 ) {

		builder.appendF64( data.georef.coordinateOperationMeters[ i ] ?? 0 );

	}

	builder.appendF64( data.georef.projectLengthToMeters );
	builder.appendF64( data.georef.mapUnitToMeters );
	builder.appendU32( chunks.length );
	for ( const chunk of chunks ) {

		const slot = new ArrayBuffer( SIDECAR_CHUNK_BYTE_LENGTH );
		writeSidecarChunk( new DataView( slot ), 0, chunk );
		builder.append( new Uint8Array( slot ) );

	}

	return builder.toUint8Array();

}

function buildElementMetadataRaw( data ) {

	const encoder = new TextEncoder();
	const stringParts = [];
	let stringOffset = 0;
	function pushString( s ) {

		const bytes = encoder.encode( s ?? '' );
		const offset = stringOffset;
		if ( bytes.byteLength > 0 ) {

			stringParts.push( bytes );
			stringOffset += bytes.byteLength;

		}

		return { offset, length: bytes.byteLength };

	}

	const records = new Uint8Array( PACKED_ELEMENT_BYTE_LENGTH * data.elements.length );
	const view = new DataView( records.buffer );
	for ( let i = 0; i < data.elements.length; i += 1 ) {

		const element = data.elements[ i ];
		const guid = pushString( element.guid ?? '' );
		const name = pushString( element.name ?? '' );
		const type = pushString( element.type ?? '' );
		writePackedElement( view, i * PACKED_ELEMENT_BYTE_LENGTH, element, guid, name, type );

	}

	const stringTable = concatByteChunks( stringParts );
	const builder = new SidecarByteBuilder();
	builder.appendU32( data.elements.length );
	builder.append( records );
	builder.appendU32( stringTable.byteLength );
	builder.append( stringTable );
	return builder.toUint8Array();

}

function writePackedElement( view, offset, element, guid, name, type ) {

	view.setUint32( offset, element.objectId, true );
	view.setUint32( offset + 4, element.modelId, true );
	view.setInt32( offset + 8, element.ifcId, true );
	view.setUint32( offset + 12, guid.offset, true );
	view.setUint32( offset + 16, guid.length, true );
	view.setUint32( offset + 20, name.offset, true );
	view.setUint32( offset + 24, name.length, true );
	view.setUint32( offset + 28, type.offset, true );
	view.setUint32( offset + 32, type.length, true );

}

function writeSidecarChunk( view, offset, chunk ) {

	view.setUint32( offset, chunk.firstMesh, true );
	view.setUint32( offset + 4, chunk.meshCount, true );
	view.setBigUint64( offset + 8, chunk.vCompOff ?? 0n, true );
	view.setBigUint64( offset + 16, chunk.vCompSize ?? 0n, true );
	view.setBigUint64( offset + 24, chunk.vRawSize ?? 0n, true );
	view.setBigUint64( offset + 32, chunk.iCompOff ?? 0n, true );
	view.setBigUint64( offset + 40, chunk.iCompSize ?? 0n, true );
	view.setBigUint64( offset + 48, chunk.iRawSize ?? 0n, true );

}

async function writeCompressedBlock( raw, level ) {

	const compressed = await compressSidecarBlock( raw, level );
	const out = new Uint8Array( 16 + compressed.byteLength );
	const view = new DataView( out.buffer );
	view.setBigUint64( 0, BigInt( compressed.byteLength ), true );
	view.setBigUint64( 8, BigInt( raw.byteLength ), true );
	out.set( compressed, 16 );
	return out;

}

/** Serialize structured sidecar data to viewer `.ifcview` bytes for IfcViewerWeb. */
export async function writeViewerSidecarBytes( data, options = {} ) {

	const level = options.level;
	const laidOut = reorderSidecarByMorton( data );
	const chunks = laidOut.chunks ?? [];
	if ( laidOut.meshes.length > 0 && chunks.length === 0 ) {

		chunks.push( { firstMesh: 0, meshCount: laidOut.meshes.length } );

	}

	const geometryChunks = [];
	const chunkToc = [];
	let geometryOffset = 0;
	for ( const chunk of chunks ) {

		const { vertices, indices } = extractChunkGeometry( laidOut, chunk );
		const vCompressed = await compressSidecarBlock( vertices, level );
		const iCompressed = await compressSidecarBlock( indices, level );
		const tocEntry = {
			firstMesh: chunk.firstMesh,
			meshCount: chunk.meshCount,
			vCompOff: BigInt( geometryOffset ),
			vCompSize: BigInt( vCompressed.byteLength ),
			vRawSize: BigInt( vertices.byteLength ),
			iCompOff: 0n,
			iCompSize: 0n,
			iRawSize: 0n
		};
		geometryChunks.push( vCompressed );
		geometryOffset += vCompressed.byteLength;
		tocEntry.iCompOff = BigInt( geometryOffset );
		tocEntry.iCompSize = BigInt( iCompressed.byteLength );
		tocEntry.iRawSize = BigInt( indices.byteLength );
		geometryChunks.push( iCompressed );
		geometryOffset += iCompressed.byteLength;
		chunkToc.push( tocEntry );

	}

	const geometrySection = concatByteChunks( geometryChunks );
	const geometryMetadataBlock = await writeCompressedBlock( buildGeometryMetadataRaw( laidOut, chunkToc ), level );
	const elementMetadataBlock = await writeCompressedBlock( buildElementMetadataRaw( laidOut ), level );
	const totalSize = 12 + 8 + geometrySection.byteLength + geometryMetadataBlock.byteLength + elementMetadataBlock.byteLength;
	const out = new Uint8Array( totalSize );
	const view = new DataView( out.buffer );
	let offset = 0;
	view.setUint32( offset, SIDECAR_MAGIC, true );
	view.setUint32( offset + 4, VIEWER_SIDECAR_FORMAT_VERSION, true );
	view.setUint32( offset + 8, SIDECAR_ENDIAN, true );
	offset += 12;
	view.setBigUint64( offset, BigInt( geometrySection.byteLength ), true );
	offset += 8;
	out.set( geometrySection, offset );
	offset += geometrySection.byteLength;
	out.set( geometryMetadataBlock, offset );
	offset += geometryMetadataBlock.byteLength;
	out.set( elementMetadataBlock, offset );
	return out;

}
