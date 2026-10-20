// Main-thread counterpart of worker.js. Loaded unbundled through fromRoot,
// like the worker, so the pipeline stays out of the bundle.

import { createLogger } from '../util/log.js';

const log = createLogger( 'convert-main' );

let assets = null;
let ready = null;

export function configureAssets( next ) {

	const same = assets?.zstdModule === next?.zstdModule && assets?.zstdWasm === next?.zstdWasm;
	assets = next ?? null;
	if ( ! same ) ready = null;

}

async function loadPipeline() {

	if ( ! assets?.zstdModule || ! assets?.zstdWasm ) {

		throw new Error( 'main-thread conversion needs zstd paths from configuration.paths' );

	}

	const pipeline = await import( './ifcopenshell/convert.js' );
	pipeline.configureCompressor( { moduleUrl: assets.zstdModule, wasmUrl: assets.zstdWasm } );
	return pipeline;

}

export async function convertBytes( bytes, filename, { kernel, numThreads, settings, exclude, onProgress, onPart } ) {

	ready ??= loadPipeline();
	const pipeline = await ready;
	log.log( `${ filename } (kernel=${ kernel })` );
	return pipeline.convertBytes( bytes, filename, { kernel, numThreads, settings, exclude, onProgress, onPart } );

}
