// IfcOpenShell IFC → .ifcview converter on the import-mapped `ifcopenshell`
// package, following threejs.html. Same contract as ../lite/convert.js.
//
// The main thread has the page import map. The worker loads this module
// through worker-host.js, which installs that same map. A worker has no
// document, so the tessellation loop does not yield; the main thread yields
// like threejs.html so the page can paint.

import * as ifcopenshell from 'ifcopenshell';
import * as ifcopenshellGeom from 'ifcopenshell/geom';
import { SidecarMeshAccumulator } from '../sidecar/mesh-builder.js';
import { writeViewerSidecarBytes } from '../sidecar/serialize.js';
import { detectFormat } from '../detect.js';
import { resolveNumThreads } from '../thread.js';
import { warmSidecarCompressor } from '../sidecar/compress.js';
export { configureCompressor } from '../sidecar/compress.js';

const TESSELLATION_START = 0.25;
const TESSELLATION_SPAN = 0.6;
const IFC_EXCLUDED_TYPES = [ 'IfcAnnotation', 'IfcOpeningElement' ];
// Yield this often so the main thread keeps painting during tessellation.
// threejs.html waits on requestAnimationFrame on the same cadence.
const YIELD_MS = 30;

const FIRST_PART_MESHES = 150;
const FIRST_PART_MS = 250;
const PART_MS = 1000;
const PART_VERTEX_BYTES = 4 * 1024 * 1024;
const MAX_PARTS = 32;

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

function shapeString( shape, method ) {

	try {

		const value = shape[ method ]?.();
		return typeof value === 'string' ? value : '';

	} catch {

		return '';

	}

}

function geometryIdOf( geometry ) {

	try {

		const value = geometry.id?.();
		return typeof value === 'string' && value ? value : '';

	} catch {

		return '';

	}

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
			guid: shapeString( shape, 'guid' ),
			name: shapeString( shape, 'name' ),
			geometryId: geometryIdOf( geometry ),
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

function rememberShape( metadata, mesh ) {

	const existing = metadata.get( mesh.id );
	if ( existing ) return existing;
	const row = {
		id: mesh.id,
		type: mesh.type,
		name: mesh.name || '',
		guid: mesh.guid || '',
	};
	metadata.set( mesh.id, row );
	return row;

}

function partFlushDue( state, now ) {

	if ( state.partAccumulator.uniqueMeshCount === 0 ) return false;
	if ( state.partCount === 0 ) {

		return state.partMeshes >= FIRST_PART_MESHES || ( now - state.lastFlush ) >= FIRST_PART_MS;

	}

	return ( now - state.lastFlush ) >= state.intervalMs || state.partVertexBytes >= PART_VERTEX_BYTES;

}

async function flushPart( state, metadata, options, force ) {

	if ( ! options.onPart || ! state.partAccumulator ) return;
	if ( ! force && ! partFlushDue( state, performance.now() ) ) return;
	if ( state.partAccumulator.uniqueMeshCount === 0 ) return;

	const bytes = await writeViewerSidecarBytes(
		state.partAccumulator.build( metadata, { modelId: options.modelId } ),
		{ level: 1 },
	);
	await options.onPart( bytes, { index: state.partCount } );
	state.partCount += 1;
	state.partMeshes = 0;
	state.partVertexBytes = 0;
	state.lastFlush = performance.now();
	state.partAccumulator = new SidecarMeshAccumulator();
	if ( state.partCount >= 8 ) {

		const grow = 1 + ( state.partCount - 8 ) / Math.max( 1, MAX_PARTS - 8 );
		state.intervalMs = PART_MS * grow;

	}

}

/**
 * Load schema/mapping/kernel plugins (and zstd) so the first conversion does
 * not pay cold-start on the critical path. Never call this on several workers
 * at once: parallel plugin loads contend badly.
 */
export async function warmRuntime( kernel = 'opencascade' ) {

	runtime ??= await ifcopenshell.init();
	await ensurePlugin( 'schema', 'ifc4' );
	await ensurePlugin( 'mapping', 'ifc4' );
	for ( const plugin of kernelPlugins( kernel ) ) await ensurePlugin( 'kernel', plugin );
	warmSidecarCompressor();
	return runtime;

}

/**
 * Tessellate an IFC with an IfcOpenShell geometry kernel and serialize a
 * `.ifcview` sidecar. `options.kernel` is the kernel plugin id.
 * `options.onPart(bytes)` receives intermediate sidecars while tessellating.
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
	const started = performance.now();
	options.onProgress?.( { phase: 'parsing', message: `Opening ${ filename }…`, ratio: 0.05 } );
	const initStarted = performance.now();
	runtime ??= await ifcopenshell.init();
	const numThreads = resolveNumThreads( options.numThreads, globalThis, runtime.threadsSupported === true );
	const schema = readSchema( view );
	await ensurePlugin( 'schema', schema );
	await ensurePlugin( 'mapping', schema );
	for ( const plugin of kernelPlugins( kernel ) ) await ensurePlugin( 'kernel', plugin );
	const initMs = performance.now() - initStarted;

	let file, settings, iterator;
	try {

		const openStarted = performance.now();
		file = ifcopenshell.open( view, filename );
		const openMs = performance.now() - openStarted;
		options.onProgress?.( { phase: 'parsing', message: 'Tessellating products…', ratio: 0.08 } );
		const metadataStarted = performance.now();
		const metadata = new Map();
		const metadataMs = performance.now() - metadataStarted;

		settings = new ifcopenshellGeom.Settings();
		// Same interpretation flag as threejs.html. Caller settings override it.
		settings.set( 'weld-vertices', false );
		if ( options.settings ) {

			for ( const [ key, value ] of Object.entries( options.settings ) ) settings.set( key, value );

		}

		const exclude = options.exclude === null ? undefined : ( options.exclude ?? IFC_EXCLUDED_TYPES );
		const iteratorOptions = { geometryLibrary: kernel, numThreads };
		if ( exclude?.length ) iteratorOptions.exclude = exclude;
		iterator = new ifcopenshellGeom.Iterator( settings, file, iteratorOptions );
		if ( ! iterator.initialize() ) {

			throw new Error( `Geometry iterator failed (kernel: ${ kernel }, threads: ${ numThreads }).` );

		}

		const accumulator = new SidecarMeshAccumulator();
		const partState = options.onPart
			? {
				partAccumulator: new SidecarMeshAccumulator(),
				partMeshes: 0,
				partVertexBytes: 0,
				partCount: 0,
				lastFlush: performance.now(),
				intervalMs: PART_MS,
			}
			: null;
		let tessellated = 0;
		let nextYield = performance.now() + YIELD_MS;
		const yieldToPage = typeof document !== 'undefined';
		const tessellateStarted = performance.now();
		do {

			if ( options.signal?.aborted ) throw new Error( 'IFC → ifcview conversion was aborted' );
			if ( yieldToPage && performance.now() >= nextYield ) {

				await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
				nextYield = performance.now() + YIELD_MS;

			}

			const mesh = readShape( iterator );
			if ( ! mesh.faces.length ) continue;
			rememberShape( metadata, mesh );
			accumulator.appendMesh( mesh, metadata );
			if ( partState ) {

				partState.partAccumulator.appendMesh( mesh, metadata );
				partState.partMeshes += 1;
				partState.partVertexBytes += mesh.vertices.byteLength;
				await flushPart( partState, metadata, options, false );

			}

			tessellated += 1;
			if ( tessellated === 1 || tessellated % 100 === 0 ) {

				options.onProgress?.( {
					phase: 'tessellating',
					message: `Tessellating ${ tessellated.toLocaleString() } elements (${ accumulator.uniqueMeshCount.toLocaleString() } meshes)…`,
					ratio: TESSELLATION_START + Math.min( tessellated / Math.max( metadata.size, 1 ), 1 ) * TESSELLATION_SPAN,
					current: tessellated,
				} );

			}

		} while ( iterator.next() );
		const tessellateMs = performance.now() - tessellateStarted;

		if ( partState ) await flushPart( partState, metadata, options, true );

		if ( accumulator.uniqueMeshCount === 0 ) throw new Error( 'Tessellation produced no visible geometry.' );

		options.onProgress?.( {
			phase: 'serializing',
			message: `Building sidecar (${ accumulator.uniqueMeshCount.toLocaleString() } meshes)…`,
			ratio: 0.88,
			current: accumulator.uniqueMeshCount,
		} );
		const serializeStarted = performance.now();
		const sidecarBytes = await writeViewerSidecarBytes( accumulator.build( metadata, { modelId: options.modelId } ) );
		const serializeMs = performance.now() - serializeStarted;
		options.onProgress?.( {
			phase: 'complete',
			message: `Sidecar ready (${ accumulator.uniqueMeshCount.toLocaleString() } meshes)…`,
			ratio: 1,
			current: accumulator.uniqueMeshCount,
		} );
		const timings = {
			initMs,
			openMs,
			metadataMs,
			tessellateMs,
			serializeMs,
			totalMs: performance.now() - started,
			partCount: partState?.partCount ?? 0,
		};
		return {
			sidecarBytes,
			meshCount: accumulator.uniqueMeshCount,
			productCount: metadata.size,
			numThreads,
			timings,
		};

	} finally {

		iterator?.dispose();
		settings?.dispose?.();
		file?.dispose();

	}

}
