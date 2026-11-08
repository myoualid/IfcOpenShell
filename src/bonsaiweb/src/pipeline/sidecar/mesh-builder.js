import { materialKeyFromRgba, meshFingerprint } from '../geometry.js';
import { SIDECAR_ENDIAN, SIDECAR_MAGIC, VIEWER_SIDECAR_FORMAT_VERSION } from './types.js';
import { quantizeSidecarVertex, writeColorFloatSlot } from './vertex.js';
const DEFAULT_MESH_COLOR = [ 0.72, 0.72, 0.74, 1 ];
const HIDDEN_ELEMENT_TYPES = new Set( [ 'IfcAnnotation', 'IfcOpeningElement' ] );
/**
 * Incremental mesh-group collector for IFCAPI {@link Mesh} tessellation.
 * Call {@link appendMesh} per iterator result, then {@link build}.
 */
export class SidecarMeshAccumulator {

	meshGroups = new Map();
	/** Append one IFCAPI {@link Mesh} from {@link GeomIterator}. */
	appendMesh( mesh, elementMetadata = new Map() ) {

		collectMeshFromIfcApi( mesh, elementMetadata, this.meshGroups );

	}
	get uniqueMeshCount() {

		return this.meshGroups.size;

	}
	build( elementMetadata, options = {} ) {

		return finalizeMeshGroups( this.meshGroups, elementMetadata, options );

	}

}
/** Build in-memory sidecar data from IFCAPI meshes. */
export function buildSidecarFromMeshes( meshes, elementMetadata, options = {} ) {

	const accumulator = new SidecarMeshAccumulator();
	for ( const mesh of meshes ) {

		accumulator.appendMesh( mesh, elementMetadata );

	}

	return accumulator.build( elementMetadata, options );

}

function finalizeMeshGroups( meshGroups, elementMetadata, options ) {

	const modelId = options.modelId ?? 1;
	const meshes = [];
	const instances = [];
	const elements = [];
	let totalVertexCount = 0;
	let totalIndexCount = 0;
	for ( const mesh of meshGroups.values() ) {

		const vertexCount = mesh.positions.length / 3;
		const indexCount = mesh.indices.length;
		if ( vertexCount === 0 || indexCount === 0 ) {

			continue;

		}

		totalVertexCount += vertexCount;
		totalIndexCount += indexCount;

	}

	const vertices = new Uint8Array( totalVertexCount * 12 );
	const indices = new Uint32Array( totalIndexCount );
	const pos = [ 0, 0, 0 ];
	const normal = [ 0, 0, 1 ];
	const rgba = [ 1, 1, 1, 1 ];
	let vboByteOffset = 0;
	let eboByteOffset = 0;
	let vertexWrite = 0;
	let indexWrite = 0;
	let objectId = 1;
	let meshId = 0;
	for ( const mesh of meshGroups.values() ) {

		const vertexCount = mesh.positions.length / 3;
		const indexCount = mesh.indices.length;
		if ( vertexCount === 0 || indexCount === 0 ) {

			continue;

		}

		const localAabb = tightAabb( mesh.positions );
		const extentRecip = extentReciprocal( localAabb.min, localAabb.max );
		const meshInstanceStart = instances.length;
		const hasNormals = mesh.normals.length === mesh.positions.length;
		const meshRgba = mesh.rgba;
		for ( let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1 ) {

			const p = vertexIndex * 3;
			pos[ 0 ] = mesh.positions[ p ];
			pos[ 1 ] = mesh.positions[ p + 1 ];
			pos[ 2 ] = mesh.positions[ p + 2 ];
			if ( hasNormals ) {

				normal[ 0 ] = mesh.normals[ p ];
				normal[ 1 ] = mesh.normals[ p + 1 ];
				normal[ 2 ] = mesh.normals[ p + 2 ];

			} else {

				normal[ 0 ] = 0;
				normal[ 1 ] = 0;
				normal[ 2 ] = 1;

			}

			if ( mesh.vertexColors ) {

				const c = vertexIndex * 4;
				rgba[ 0 ] = mesh.vertexColors[ c ];
				rgba[ 1 ] = mesh.vertexColors[ c + 1 ];
				rgba[ 2 ] = mesh.vertexColors[ c + 2 ];
				rgba[ 3 ] = mesh.vertexColors[ c + 3 ];

			} else {

				rgba[ 0 ] = meshRgba[ 0 ];
				rgba[ 1 ] = meshRgba[ 1 ];
				rgba[ 2 ] = meshRgba[ 2 ];
				rgba[ 3 ] = meshRgba[ 3 ];

			}

			quantizeSidecarVertex( pos, normal, rgba, localAabb.min, extentRecip, vertices, vertexWrite );
			vertexWrite += 12;

		}

		for ( let i = 0; i < indexCount; i += 1 ) {

			indices[ indexWrite + i ] = mesh.indices[ i ];

		}

		indexWrite += indexCount;
		meshes.push( {
			vboByteOffset,
			vertexCount,
			eboByteOffset,
			indexCount,
			localAabbMin: localAabb.min,
			localAabbMax: localAabb.max,
			firstInstance: meshInstanceStart,
			instanceCount: 0,
			lod1EboByteOffset: 0,
			lod1IndexCount: 0
		} );
		for ( const pending of mesh.instances ) {

			const metadata = elementMetadata.get( pending.elementId );
			const elementType = metadata?.type ?? '';
			if ( HIDDEN_ELEMENT_TYPES.has( elementType ) ) {

				continue;

			}

			const placement = new Float64Array( 16 );
			const transform = new Float32Array( 16 );
			for ( let i = 0; i < 16; i += 1 ) {

				const value = pending.transform[ i ];
				placement[ i ] = value;
				transform[ i ] = value;

			}

			const worldAabb = worldAabbFromLocal( localAabb.min, localAabb.max, transform );
			instances.push( {
				meshId,
				objectId,
				colorOverrideRgba8: 0,
				modelId,
				placementTransformation: placement,
				transform,
				worldAabbMin: worldAabb.min,
				worldAabbMax: worldAabb.max
			} );
			elements.push( {
				objectId,
				modelId,
				ifcId: pending.elementId,
				guid: metadata?.guid ?? '',
				name: metadata?.name ?? '',
				type: elementType
			} );
			objectId += 1;

		}

		meshes[ meshId ].instanceCount = instances.length - meshInstanceStart;
		vboByteOffset += vertexCount * 12;
		eboByteOffset += indexCount * 4;
		meshId += 1;

	}

	return {
		header: {
			magic: SIDECAR_MAGIC,
			version: VIEWER_SIDECAR_FORMAT_VERSION,
			endian: SIDECAR_ENDIAN
		},
		vertices,
		indices,
		meshes,
		instances,
		georef: defaultGeoref(),
		elements,
		stringTable: ''
	};

}

function collectMeshFromIfcApi( mesh, elementMetadata, meshGroups ) {

	const metadata = elementMetadata.get( mesh.id );
	const elementType = metadata?.type ?? mesh.type;
	if ( HIDDEN_ELEMENT_TYPES.has( elementType ) ) {

		return;

	}

	const baked = bakeIfcApiMesh( mesh );
	if ( ! baked.positions.length || ! baked.indices.length ) {

		return;

	}

	const fingerprint = meshFingerprint( baked.positions, baked.indices, baked.materialKey, mesh.geometryId );
	const transform = new Float32Array( mesh.transform );
	const existing = meshGroups.get( fingerprint );
	if ( existing ) {

		existing.instances.push( {
			elementId: mesh.id,
			transform
		} );
		return;

	}

	meshGroups.set( fingerprint, {
		positions: baked.positions,
		normals: baked.normals,
		indices: baked.indices,
		vertexColors: baked.vertexColors,
		rgba: baked.rgba,
		instances: [
			{
				elementId: mesh.id,
				transform
			}
		]
	} );

}

function bakeIfcApiMesh( mesh ) {

	const srcPositions = mesh.vertices instanceof Float32Array ? mesh.vertices : new Float32Array( mesh.vertices );
	const srcNormals = mesh.normals == null
		? new Float32Array( 0 )
		: mesh.normals instanceof Float32Array
			? mesh.normals
			: new Float32Array( mesh.normals );
	const srcIndices = mesh.faces instanceof Int32Array || mesh.faces instanceof Uint32Array
		? mesh.faces
		: new Int32Array( mesh.faces );
	const numTris = ( mesh.faces.length / 3 ) | 0;
	const colors = mesh.colors ?? [];
	const materialIds = mesh.materialIds ?? [];
	const matCount = Math.max( 1, ( colors.length / 4 ) | 0 );
	const rgbaByMat = new Array( matCount );
	const keyByMat = new Array( matCount );
	for ( let matId = 0; matId < matCount; matId += 1 ) {

		const base = matId * 4;
		const rgba = base + 3 < colors.length
			? sanitizeMaterialRgba( [ colors[ base ], colors[ base + 1 ], colors[ base + 2 ], colors[ base + 3 ] ] )
			: sanitizeMaterialRgba( DEFAULT_MESH_COLOR );
		rgbaByMat[ matId ] = rgba;
		keyByMat[ matId ] = materialKeyFromRgba( rgba );

	}

	const matIdAt = ( faceIndex ) => {

		const id = faceIndex < materialIds.length ? materialIds[ faceIndex ] : 0;
		return id >= 0 && id < matCount ? id : 0;

	};

	const firstMat = numTris === 0 ? 0 : matIdAt( 0 );
	const firstRgba = rgbaByMat[ firstMat ];
	if ( numTris === 0 ) {

		return {
			positions: srcPositions,
			normals: srcNormals,
			indices: srcIndices,
			vertexColors: null,
			rgba: firstRgba,
			materialKey: keyByMat[ firstMat ]
		};

	}

	let singleMaterial = true;
	const runKeys = [];
	let runMat = firstMat;
	let runLen = 1;
	for ( let faceIndex = 1; faceIndex < numTris; faceIndex += 1 ) {

		const matId = matIdAt( faceIndex );
		if ( matId !== firstMat )
			singleMaterial = false;
		if ( matId === runMat ) {

			runLen += 1;

		} else {

			runKeys.push( `${runMat}:${runLen}:${keyByMat[ runMat ]}` );
			runMat = matId;
			runLen = 1;

		}

	}

	runKeys.push( `${runMat}:${runLen}:${keyByMat[ runMat ]}` );
	const materialKey = singleMaterial ? keyByMat[ firstMat ] : runKeys.join( '|' );
	if ( singleMaterial ) {

		return {
			positions: srcPositions,
			normals: srcNormals,
			indices: srcIndices,
			vertexColors: null,
			rgba: firstRgba,
			materialKey
		};

	}

	const positions = [];
	const normals = [];
	const vertexColors = [];
	const outIndices = [];
	const remap = new Map();
	const emitVertex = ( origIdx, matId ) => {

		const key = origIdx * matCount + matId;
		const existing = remap.get( key );
		if ( existing !== undefined ) {

			return existing;

		}

		const rgba = rgbaByMat[ matId ];
		const newIdx = positions.length / 3;
		positions.push( srcPositions[ origIdx * 3 ], srcPositions[ origIdx * 3 + 1 ], srcPositions[ origIdx * 3 + 2 ] );
		if ( srcNormals.length === srcPositions.length ) {

			normals.push( srcNormals[ origIdx * 3 ], srcNormals[ origIdx * 3 + 1 ], srcNormals[ origIdx * 3 + 2 ] );

		} else {

			normals.push( 0, 0, 1 );

		}

		vertexColors.push( rgba[ 0 ], rgba[ 1 ], rgba[ 2 ], rgba[ 3 ] );
		remap.set( key, newIdx );
		return newIdx;

	};

	for ( let tri = 0; tri < numTris; tri += 1 ) {

		const matId = matIdAt( tri );
		outIndices.push( emitVertex( srcIndices[ tri * 3 ], matId ), emitVertex( srcIndices[ tri * 3 + 1 ], matId ), emitVertex( srcIndices[ tri * 3 + 2 ], matId ) );

	}

	return {
		positions: new Float32Array( positions ),
		normals: new Float32Array( normals ),
		indices: new Int32Array( outIndices ),
		vertexColors: new Float32Array( vertexColors ),
		rgba: firstRgba,
		materialKey
	};

}

/** Pass tessellation RGBA through unchanged (matches desktop GeometryStreamer). */
function sanitizeMaterialRgba( rgba ) {

	const clamp = ( value ) => Number.isFinite( value ) ? Math.min( 1, Math.max( 0, value ) ) : 0;
	const alpha = rgba[ 3 ];
	const a = Number.isFinite( alpha ) && alpha > 0 ? clamp( alpha ) : 1;
	return [ clamp( rgba[ 0 ] ), clamp( rgba[ 1 ] ), clamp( rgba[ 2 ] ), a ];

}

function defaultGeoref() {

	const coordinateOperationMeters = new Float64Array( 16 );
	coordinateOperationMeters[ 0 ] = 1;
	coordinateOperationMeters[ 5 ] = 1;
	coordinateOperationMeters[ 10 ] = 1;
	coordinateOperationMeters[ 15 ] = 1;
	return {
		hasCoordinateOperation: false,
		coordinateOperationMeters,
		projectLengthToMeters: 1,
		mapUnitToMeters: 1
	};

}

function tightAabb( positions ) {

	const min = [ Infinity, Infinity, Infinity ];
	const max = [ - Infinity, - Infinity, - Infinity ];
	for ( let i = 0; i < positions.length; i += 3 ) {

		for ( let axis = 0; axis < 3; axis += 1 ) {

			const value = positions[ i + axis ];
			if ( value < min[ axis ] ) {

				min[ axis ] = value;

			}

			if ( value > max[ axis ] ) {

				max[ axis ] = value;

			}

		}

	}

	for ( let axis = 0; axis < 3; axis += 1 ) {

		if ( ! Number.isFinite( min[ axis ] ) || ! Number.isFinite( max[ axis ] ) ) {

			min[ axis ] = 0;
			max[ axis ] = 0;

		} else if ( min[ axis ] === max[ axis ] ) {

			max[ axis ] = min[ axis ] + 1e-6;

		}

	}

	return { min, max };

}

function extentReciprocal( min, max ) {

	return [
		max[ 0 ] - min[ 0 ] > 0 ? 1 / ( max[ 0 ] - min[ 0 ] ) : 0,
		max[ 1 ] - min[ 1 ] > 0 ? 1 / ( max[ 1 ] - min[ 1 ] ) : 0,
		max[ 2 ] - min[ 2 ] > 0 ? 1 / ( max[ 2 ] - min[ 2 ] ) : 0
	];

}

function worldAabbFromLocal( localMin, localMax, transform ) {

	const corners = [];
	for ( const x of [ localMin[ 0 ], localMax[ 0 ] ] ) {

		for ( const y of [ localMin[ 1 ], localMax[ 1 ] ] ) {

			for ( const z of [ localMin[ 2 ], localMax[ 2 ] ] ) {

				corners.push( transformPoint( transform, x, y, z ) );

			}

		}

	}

	const min = [ Infinity, Infinity, Infinity ];
	const max = [ - Infinity, - Infinity, - Infinity ];
	for ( const corner of corners ) {

		for ( let axis = 0; axis < 3; axis += 1 ) {

			if ( corner[ axis ] < min[ axis ] ) {

				min[ axis ] = corner[ axis ];

			}

			if ( corner[ axis ] > max[ axis ] ) {

				max[ axis ] = corner[ axis ];

			}

		}

	}

	return { min, max };

}

function transformPoint( matrix, x, y, z ) {

	const w = matrix[ 3 ] * x + matrix[ 7 ] * y + matrix[ 11 ] * z + matrix[ 15 ];
	const invW = w !== 0 ? 1 / w : 1;
	return [
		( matrix[ 0 ] * x + matrix[ 4 ] * y + matrix[ 8 ] * z + matrix[ 12 ] ) * invW,
		( matrix[ 1 ] * x + matrix[ 5 ] * y + matrix[ 9 ] * z + matrix[ 13 ] ) * invW,
		( matrix[ 2 ] * x + matrix[ 6 ] * y + matrix[ 10 ] * z + matrix[ 14 ] ) * invW
	];

}

function createStreamingUploadState() {

	return {
		fingerprintToLocalMeshId: new Map(),
		nextLocalMeshId: 0,
		nextObjectId: 1
	};

}

/** Incremental mesh/instance deltas for direct viewer upload during tessellation. */
export class StreamingMeshUploadState {

	accumulator = new SidecarMeshAccumulator();
	stream = createStreamingUploadState();
	get uniqueMeshCount() {

		return this.accumulator.uniqueMeshCount;

	}
	appendMesh( mesh, elementMetadata = new Map() ) {

		const beforeCount = this.accumulator.uniqueMeshCount;
		const metadata = elementMetadata.get( mesh.id );
		const elementType = metadata?.type ?? mesh.type;
		if ( HIDDEN_ELEMENT_TYPES.has( elementType ) ) {

			return [];

		}

		const baked = bakeIfcApiMesh( mesh );
		if ( ! baked.positions.length || ! baked.indices.length ) {

			return [];

		}

		const fingerprint = meshFingerprint( baked.positions, baked.indices, baked.materialKey, mesh.geometryId );
		const transform = new Float32Array( mesh.transform );
		const existingLocalMeshId = this.stream.fingerprintToLocalMeshId.get( fingerprint );
		const instance = buildMeshUploadInstance( this.stream.nextObjectId, mesh.id, transform );
		this.stream.nextObjectId += 1;
		this.accumulator.appendMesh( mesh, elementMetadata );
		if ( existingLocalMeshId != null ) {

			return [ { kind: 'instance', localMeshId: existingLocalMeshId, instance } ];

		}

		if ( this.accumulator.uniqueMeshCount <= beforeCount ) {

			return [];

		}

		const localMeshId = this.stream.nextLocalMeshId;
		this.stream.nextLocalMeshId += 1;
		this.stream.fingerprintToLocalMeshId.set( fingerprint, localMeshId );
		return [
			{
				kind: 'mesh',
				localMeshId,
				vertices: uniqueMeshToStreamVertices( {
					positions: baked.positions,
					normals: baked.normals,
					indices: baked.indices,
					vertexColors: baked.vertexColors,
					rgba: baked.rgba,
					instances: []
				} ),
				indices: new Uint32Array( baked.indices ),
				instance
			}
		];

	}
	build( elementMetadata, options = {} ) {

		return this.accumulator.build( elementMetadata, options );

	}

}
function buildMeshUploadInstance( objectId, elementId, transform ) {

	const placement = new Float64Array( 16 );
	for ( let i = 0; i < 16; i += 1 ) {

		placement[ i ] = transform[ i ];

	}

	return {
		objectId,
		elementId,
		transform: placement,
		colorOverrideRgba8: 0
	};

}

function uniqueMeshToStreamVertices( mesh ) {

	const vertexCount = mesh.positions.length / 3;
	const out = new Float32Array( vertexCount * 7 );
	for ( let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1 ) {

		const base = vertexIndex * 7;
		out[ base ] = mesh.positions[ vertexIndex * 3 ];
		out[ base + 1 ] = mesh.positions[ vertexIndex * 3 + 1 ];
		out[ base + 2 ] = mesh.positions[ vertexIndex * 3 + 2 ];
		const hasNormals = mesh.normals.length === mesh.positions.length;
		out[ base + 3 ] = hasNormals ? mesh.normals[ vertexIndex * 3 ] : 0;
		out[ base + 4 ] = hasNormals ? mesh.normals[ vertexIndex * 3 + 1 ] : 0;
		out[ base + 5 ] = hasNormals ? mesh.normals[ vertexIndex * 3 + 2 ] : 1;
		const rgba = mesh.vertexColors
			? [
				mesh.vertexColors[ vertexIndex * 4 ],
				mesh.vertexColors[ vertexIndex * 4 + 1 ],
				mesh.vertexColors[ vertexIndex * 4 + 2 ],
				mesh.vertexColors[ vertexIndex * 4 + 3 ]
			]
			: mesh.rgba;
		out[ base + 6 ] = 0;
		writeColorFloatSlot( out, base + 6, rgba );

	}

	return out;

}

/** Build direct-load mesh/instance chunks for IfcViewerWeb from IFCAPI meshes. */
export function buildMeshUploadBundlesFromMeshes( meshes, elementMetadata ) {

	const meshGroups = new Map();
	for ( const mesh of meshes ) {

		collectMeshFromIfcApi( mesh, elementMetadata, meshGroups );

	}

	const bundles = [];
	let objectId = 1;
	let localMeshId = 0;
	for ( const mesh of meshGroups.values() ) {

		const vertexCount = mesh.positions.length / 3;
		const indexCount = mesh.indices.length;
		if ( vertexCount === 0 || indexCount === 0 ) {

			continue;

		}

		const instances = [];
		for ( const pending of mesh.instances ) {

			const metadata = elementMetadata.get( pending.elementId );
			const elementType = metadata?.type ?? '';
			if ( HIDDEN_ELEMENT_TYPES.has( elementType ) ) {

				continue;

			}

			const transform = new Float64Array( 16 );
			for ( let i = 0; i < 16; i += 1 ) {

				transform[ i ] = pending.transform[ i ];

			}

			instances.push( {
				objectId,
				elementId: pending.elementId,
				transform,
				colorOverrideRgba8: 0
			} );
			objectId += 1;

		}

		if ( instances.length === 0 ) {

			continue;

		}

		bundles.push( {
			localMeshId,
			vertices: uniqueMeshToStreamVertices( mesh ),
			indices: new Uint32Array( mesh.indices ),
			instances
		} );
		localMeshId += 1;

	}

	return bundles;

}
