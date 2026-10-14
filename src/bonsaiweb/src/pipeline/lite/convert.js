// ifc-lite powered IFC → .ifcview converter. Parallel implementation of
// src/core/IfcPipeline (which uses ifcopenshell's geometry kernels).
//
// Why this exists: the ifcopenshell geometry kernels pull a C++ wasm
// (manifold / cgal / opencascade) into the convert worker, duplicating a
// 3+ MB module we already load on the main thread for data queries. The
// ifc-lite Rust/wasm pipeline is self-contained and roughly matches the
// shape the sidecar accumulator wants, so swapping it in here lets the
// worker drop its ifcopenshell dependency entirely while the main-thread
// ifcopenshell keeps serving psets/qtos/attributes unchanged.
//
// Keep this file API-compatible with ../IfcPipeline/convert's exported
// convertBytes / configureCompressor contract so ConvertWorker can be
// swapped by changing one import.

import { GeometryProcessor } from '../../../vendor/@ifc-lite/geometry/dist/index.js';
import { SidecarMeshAccumulator } from '../../../dist/core/IfcPipeline/sidecar/mesh-builder.js';
import { writeViewerSidecarBytes } from '../../../dist/core/IfcPipeline/sidecar/serialize.js';
import { detectFormat } from '../../../dist/core/IfcPipeline/detect.js';
// The sidecar serializer zstd-compresses chunks via @ioai/wasm-zstd. ifc-lite
// doesn't change that; we re-export the real configureCompressor so the
// worker can hand it the wasm-zstd URL exactly like ConvertWorker.
export { configureCompressor } from '../../../dist/core/IfcPipeline/sidecar/compress.js';
import { adaptMeshDataToIfcMesh } from './mesh-adapter.js';
import { buildExpressIdToGuidMap } from './guid-index.js';

const TESSELLATION_START = 0.25;
const TESSELLATION_SPAN = 0.6;

const IFC_EXCLUDED_TYPES = new Set( [ 'IfcAnnotation', 'IfcOpeningElement' ] );

let sharedProcessor = null;
async function getProcessor() {

	if ( ! sharedProcessor ) {

		sharedProcessor = new GeometryProcessor();
		await sharedProcessor.init();

	}

	return sharedProcessor;

}

/**
 * Tessellate an IFC via ifc-lite and serialize a `.ifcview` sidecar.
 */
export async function convertBytes( bytes, filename = 'model.ifc', options = {} ) {

	const view = bytes instanceof ArrayBuffer ? new Uint8Array( bytes ) : bytes;

	// Short-circuit: an input that's already a sidecar passes straight through,
	// matching the IfcPipeline behaviour so autoload paths don't branch.
	const format = detectFormat( view, filename );
	if ( format === 'ifcview' ) {

		options.onProgress?.( {
			phase: 'complete',
			message: 'Input is already an .ifcview sidecar…',
			ratio: 1,
		} );
		return { sidecarBytes: view.slice(), meshCount: 0, productCount: 0 };

	}

	if ( format !== 'ifc-spf' && format !== 'unknown' ) {

		throw new Error( `Unsupported input format for ifcview conversion: ${ format } (${ filename })` );

	}

	options.onProgress?.( { phase: 'parsing', message: `Opening ${ filename }…`, ratio: 0.05 } );

	// Build the expressId → GlobalId column from the raw STEP file. ifc-lite's
	// MeshData doesn't carry guids, but ElementRegistry.findEntity() queries
	// the live ifcopenshell file by guid — without this map every pick fails
	// to resolve back to an IFC entity.
	const guidByExpressId = buildExpressIdToGuidMap( view );

	const processor = await getProcessor();

	options.onProgress?.( {
		phase: 'parsing', message: 'Processing geometry with ifc-lite…', ratio: 0.15,
	} );

	const result = await processor.process( view );
	const sourceMeshes = result?.meshes ?? [];
	if ( sourceMeshes.length === 0 ) {

		throw new Error( 'ifc-lite produced no meshes for this IFC — empty or unsupported geometry.' );

	}

	// Group pass: SidecarMeshAccumulator expects one "Mesh" per IFC element
	// (its appendMesh is written for that cardinality). ifc-lite emits
	// multiple MeshData per expressId when an element has distinct materials
	// or representation items; we fold them so each element contributes one
	// entry to the accumulator and the viewer sees one object per IFC
	// product. Grouping by expressId is the shape mesh-builder expects.
	options.onProgress?.( {
		phase: 'parsed',
		message: `Collected ${ result.totalVertices?.toLocaleString?.() ?? '?' } vertices from ifc-lite…`,
		ratio: 0.22,
	} );

	const byElement = new Map();
	for ( const m of sourceMeshes ) {

		const t = m.ifcType ?? 'IfcProduct';
		if ( IFC_EXCLUDED_TYPES.has( t ) ) continue;
		const id = m.expressId ?? 0;
		if ( ! byElement.has( id ) ) byElement.set( id, [] );
		byElement.get( id ).push( m );

	}

	// elementMetadata = SidecarMeshAccumulator's lookup from mesh.id to the
	// (guid, name, type) that will land in the sidecar's element record. Only
	// guid+type are known from the STEP scan + MeshData; name waits for the
	// main-thread liveIfc pass to attach it from ifcopenshell's richer data.
	const elementMetadata = new Map();
	for ( const [ id, meshes ] of byElement ) {

		elementMetadata.set( id, {
			guid: guidByExpressId.get( id ) ?? '',
			name: '',
			type: meshes[ 0 ]?.ifcType ?? 'IfcProduct',
		} );

	}

	const accumulator = new SidecarMeshAccumulator();
	let tessellated = 0;
	const total = Math.max( byElement.size, 1 );
	for ( const [ , meshes ] of byElement ) {

		if ( options.signal?.aborted ) {

			throw new Error( 'IFC → ifcview conversion was aborted' );

		}

		// For elements with multiple submeshes (per-material / per-part), feed
		// each to the accumulator; it dedupes identical geometry and tracks
		// instances per element.
		for ( const m of meshes ) {

			accumulator.appendMesh( adaptMeshDataToIfcMesh( m ), elementMetadata );

		}

		tessellated += 1;
		if ( tessellated === 1 || tessellated % 25 === 0 ) {

			options.onProgress?.( {
				phase: 'tessellating',
				message: `Tessellating ${ tessellated.toLocaleString() } elements (${ accumulator.uniqueMeshCount.toLocaleString() } unique meshes)…`,
				ratio: TESSELLATION_START + Math.min( tessellated / total, 1 ) * TESSELLATION_SPAN,
				current: tessellated,
			} );

		}

	}

	if ( accumulator.uniqueMeshCount === 0 ) {

		throw new Error( 'Tessellation produced no visible geometry.' );

	}

	options.onProgress?.( {
		phase: 'serializing',
		message: `Building sidecar (${ accumulator.uniqueMeshCount.toLocaleString() } meshes, ${ elementMetadata.size.toLocaleString() } with guid)…`,
		ratio: 0.88,
		current: accumulator.uniqueMeshCount,
	} );

	const sidecarBytes = await writeViewerSidecarBytes(
		accumulator.build( elementMetadata, { modelId: options.modelId } ),
	);

	options.onProgress?.( {
		phase: 'complete',
		message: `Sidecar ready (${ accumulator.uniqueMeshCount.toLocaleString() } meshes)…`,
		ratio: 1,
		current: accumulator.uniqueMeshCount,
	} );

	return {
		sidecarBytes,
		meshCount: accumulator.uniqueMeshCount,
		productCount: byElement.size,
	};

}
