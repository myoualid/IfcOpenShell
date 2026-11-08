// This file was generated with the assistance of an AI coding tool.
//
// glTF 2.0 / GLB (e.g. a Blender export) → .ifcview, with the same contract
// as ifcopenshell/convert.js: { sidecarBytes, meshCount, productCount }, and
// `onPart(bytes)` for partial sidecars the viewer can stream in.

import { convertGltf, loadConverter } from './index.js';

const PART_VERTEX_BYTES = 4 * 1024 * 1024;

export async function convertGltfBytes( bytes, filename = 'model.glb', options = {} ) {

	const started = performance.now();
	options.onProgress?.( { phase: 'parsing', message: `Reading ${ filename }…`, ratio: 0.1 } );
	await loadConverter();

	// The converter calls onPart synchronously. A worker posts the part right
	// away; an async main-thread consumer is awaited once conversion ends.
	const pending = [];
	const onPart = options.onPart
		? ( partBytes ) => {

			const result = options.onPart( partBytes, { index: pending.length } );
			pending.push( Promise.resolve( result ) );

		}
		: undefined;

	const result = convertGltf( bytes, onPart, PART_VERTEX_BYTES, options.modelId ?? 1 );
	await Promise.all( pending );
	const meshCount = result.meshCount;
	const productCount = result.elementCount;
	const sidecarBytes = result.bytes;
	const partCount = result.partCount;
	result.free();
	options.onProgress?.( {
		phase: 'complete',
		message: `Sidecar ready (${ meshCount.toLocaleString() } meshes)…`,
		ratio: 1,
		current: meshCount,
	} );
	return {
		sidecarBytes,
		meshCount,
		productCount,
		timings: { totalMs: performance.now() - started, partCount },
	};

}
