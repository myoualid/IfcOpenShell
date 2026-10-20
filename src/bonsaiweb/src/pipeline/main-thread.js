// Main-thread counterpart of worker.js. Loaded unbundled through fromRoot,
// like the worker, so the pipeline stays out of the bundle.

import { createLogger } from '../util/log.js';

const log = createLogger( 'convert-main' );

const ZSTD_WASM = 'https://cdn.jsdelivr.net/npm/@ioai/wasm-zstd@latest/dist/wasm-zstd.wasm';

let ready = null;

async function loadPipeline() {

	const pipeline = await import( './ifcopenshell/convert.js' );
	pipeline.configureCompressor( { wasmUrl: ZSTD_WASM } );
	return pipeline;

}

export async function convertBytes( bytes, filename, { kernel, numThreads, settings, exclude, onProgress, onPart } ) {

	ready ??= loadPipeline();
	const pipeline = await ready;
	log.log( `${ filename } (kernel=${ kernel })` );
	return pipeline.convertBytes( bytes, filename, { kernel, numThreads, settings, exclude, onProgress, onPart } );

}
