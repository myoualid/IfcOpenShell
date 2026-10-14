// Main-thread counterpart of worker.js / worker-lite.js. Loaded unbundled
// through fromRoot, like the workers, so the pipelines stay out of the bundle.

import { createLogger } from '../util/log.js';

const log = createLogger( 'convert-main' );

const ZSTD_WASM = 'https://cdn.jsdelivr.net/npm/@ioai/wasm-zstd@latest/dist/wasm-zstd.wasm';

// Both modules export the same convertBytes / configureCompressor pair.
const engines = {
	'ifc-lite': () => import( './lite/convert.js' ),
	ifcopenshell: () => import( './ifcopenshell/convert.js' ),
};

const ready = new Map();

async function loadEngine( engine ) {

	const pipeline = await engines[ engine ]();
	pipeline.configureCompressor( { wasmUrl: ZSTD_WASM } );
	return pipeline;

}

export async function convertBytes( bytes, filename, { engine, kernel, onProgress } ) {

	if ( ! engines[ engine ] ) throw new Error( `unknown geometry engine "${ engine }"` );
	if ( ! ready.has( engine ) ) ready.set( engine, loadEngine( engine ) );
	const pipeline = await ready.get( engine );
	log.log( `${ filename } (engine=${ engine }, kernel=${ kernel })` );
	return pipeline.convertBytes( bytes, filename, { kernel, onProgress } );

}
