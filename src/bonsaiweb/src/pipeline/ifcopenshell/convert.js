// IfcOpenShell IFC → .ifcview converter on the import-mapped (CDN)
// `ifcopenshell` package, following threejs.html. Same contract as
// ../lite/convert.js.
//
// The CDN package imports bare `@ifcopenshell/wasm` specifiers, so this
// module only loads where the page import map applies (the main thread).

import * as ifcopenshell from 'ifcopenshell';
import * as ifcopenshellGeom from 'ifcopenshell/geom';
import { SidecarMeshAccumulator } from '../../../dist/core/IfcPipeline/sidecar/mesh-builder.js';
import { writeViewerSidecarBytes } from '../../../dist/core/IfcPipeline/sidecar/serialize.js';
import { detectFormat } from '../../../dist/core/IfcPipeline/detect.js';
export { configureCompressor } from '../../../dist/core/IfcPipeline/sidecar/compress.js';

const TESSELLATION_START = 0.25;
const TESSELLATION_SPAN = 0.6;
const IFC_EXCLUDED_TYPES = new Set( [ 'IfcAnnotation', 'IfcOpeningElement' ] );
// Yield this often so the main thread keeps painting during tessellation.
const YIELD_MS = 30;

let runtime = null;

function readSchema( bytes ) {

	const stream = runtime.raw.parse.streamFromString( new TextDecoder().decode( bytes.slice( 0, 4096 ) ) );
	let header, declaration;
	try {

		header = stream.header();
		declaration = header.fileSchema();
		return declaration.schemaIdentifiers()[ 0 ].toLowerCase();

	} finally {

		declaration?.destroy();
		header?.destroy();
		stream.destroy();

	}

}

async function ensurePlugin( kind, id ) {

	if ( runtime.loadedPlugins().includes( `${ kind }:${ id }` ) ) return;
	await runtime.loadPlugin( kind, id );

}

// 'hybrid-manifold-opencascade' needs both kernel plugins.
function kernelPlugins( kernel ) {

	return kernel.startsWith( 'hybrid-' ) ? kernel.slice( 'hybrid-'.length ).split( '-' ) : [ kernel ];

}

function buildElementMetadata( file ) {

	const map = new Map();
	for ( const entity of file.byType( 'IfcProduct' ) ) {

		const name = entity.get( 'Name' );
		const guid = entity.get( 'GlobalId' );
		map.set( entity.id(), {
			id: entity.id(),
			type: entity.isA(),
			name: typeof name === 'string' ? name : '',
			guid: typeof guid === 'string' ? guid : '',
		} );

	}

	return map;

}

function readShape( iterator ) {

	const shape = iterator.get();
	const tri = shape.asTriangulationElement();
	const geometry = tri.geometry();
	try {

		const normals = geometry.normalsBuffer( Float32Array );
		return {
			id: shape.id(),
			type: shape.type(),
			vertices: geometry.vertsBuffer( Float32Array ),
			faces: geometry.facesBuffer( Uint32Array ),
			normals: normals.length > 0 ? normals : null,
			colors: geometry.colorsBuffer( Float32Array ),
			materialIds: geometry.materialIdsBuffer( Int32Array ),
			transform: shape.transformationBuffer( Float64Array ),
		};

	} finally {

		geometry.destroy();
		tri.destroy();
		shape.destroy();

	}

}

/**
 * Tessellate an IFC with an IfcOpenShell geometry kernel and serialize a
 * `.ifcview` sidecar. `options.kernel` is the kernel plugin id.
 */
export async function convertBytes( bytes, filename = 'model.ifc', options = {} ) {

	const view = bytes instanceof ArrayBuffer ? new Uint8Array( bytes ) : bytes;
	const format = detectFormat( view, filename );
	if ( format === 'ifcview' ) {

		options.onProgress?.( { phase: 'complete', message: 'Input is already an .ifcview sidecar…', ratio: 1 } );
		return { sidecarBytes: view.slice(), meshCount: 0, productCount: 0 };

	}

	if ( format !== 'ifc-spf' && format !== 'unknown' ) {

		throw new Error( `Unsupported input format for ifcview conversion: ${ format } (${ filename })` );

	}

	const kernel = options.kernel ?? 'opencascade';
	options.onProgress?.( { phase: 'parsing', message: `Opening ${ filename }…`, ratio: 0.05 } );
	runtime ??= await ifcopenshell.init();
	const schema = readSchema( view );
	await ensurePlugin( 'schema', schema );
	await ensurePlugin( 'mapping', schema );
	for ( const plugin of kernelPlugins( kernel ) ) await ensurePlugin( 'kernel', plugin );

	let file, settings, iterator;
	try {

		file = ifcopenshell.open( view, filename );
		options.onProgress?.( { phase: 'parsing', message: 'Collecting product metadata…', ratio: 0.08 } );
		const metadata = buildElementMetadata( file );
		options.onProgress?.( {
			phase: 'parsed',
			message: `Parsed ${ metadata.size.toLocaleString() } products…`,
			ratio: 0.22,
			current: metadata.size,
		} );

		settings = new ifcopenshellGeom.Settings();
		settings.set( 'weld-vertices', false );
		iterator = new ifcopenshellGeom.Iterator( settings, file, { geometryLibrary: kernel } );
		if ( ! iterator.initialize() ) {

			throw new Error( `Geometry iterator failed (kernel: ${ kernel }).` );

		}

		const accumulator = new SidecarMeshAccumulator();
		const total = Math.max( metadata.size, 1 );
		let tessellated = 0;
		let nextYield = performance.now() + YIELD_MS;
		do {

			if ( options.signal?.aborted ) throw new Error( 'IFC → ifcview conversion was aborted' );
			if ( performance.now() >= nextYield ) {

				await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
				nextYield = performance.now() + YIELD_MS;

			}

			const mesh = readShape( iterator );
			if ( IFC_EXCLUDED_TYPES.has( mesh.type ) || ! mesh.faces.length ) continue;
			accumulator.appendMesh( mesh, metadata );
			tessellated += 1;
			if ( tessellated === 1 || tessellated % 25 === 0 ) {

				options.onProgress?.( {
					phase: 'tessellating',
					message: `Tessellating ${ tessellated.toLocaleString() } elements (${ accumulator.uniqueMeshCount.toLocaleString() } meshes)…`,
					ratio: TESSELLATION_START + Math.min( tessellated / total, 1 ) * TESSELLATION_SPAN,
					current: tessellated,
				} );

			}

		} while ( iterator.next() );

		if ( accumulator.uniqueMeshCount === 0 ) throw new Error( 'Tessellation produced no visible geometry.' );

		options.onProgress?.( {
			phase: 'serializing',
			message: `Building sidecar (${ accumulator.uniqueMeshCount.toLocaleString() } meshes)…`,
			ratio: 0.88,
			current: accumulator.uniqueMeshCount,
		} );
		const sidecarBytes = await writeViewerSidecarBytes( accumulator.build( metadata, { modelId: options.modelId } ) );
		options.onProgress?.( {
			phase: 'complete',
			message: `Sidecar ready (${ accumulator.uniqueMeshCount.toLocaleString() } meshes)…`,
			ratio: 1,
			current: accumulator.uniqueMeshCount,
		} );
		return { sidecarBytes, meshCount: accumulator.uniqueMeshCount, productCount: metadata.size };

	} finally {

		iterator?.dispose();
		settings?.dispose?.();
		file?.dispose();

	}

}
