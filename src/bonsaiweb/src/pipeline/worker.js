// Module worker: runs ifcopenshell + IfcPipeline off the main thread.
// Two ifcopenshell wasm instances are expected (one here, one in the main
// thread for inspection APIs); they have independent heaps and sessions.

import { createLogger } from '../util/log.js';
import * as ifcopenshell from 'ifcopenshell';
import { convertBytes, configureCompressor } from '../../dist/core/IfcPipeline/index.js';

const log = createLogger( 'convert-worker' );
log.log( 'module loading…' );

// Early top-level errors (bad imports, unresolved wasm assets) land in
// `self.onerror` and the main thread sees them via Worker.onerror.
// Routing uncaught promise rejections too so nothing dies silently.
self.addEventListener( 'unhandledrejection', ( ev ) => {

	log.error( 'unhandled rejection:', ev.reason );

} );

log.log( 'imports resolved' );

const ZSTD_WASM = 'https://cdn.jsdelivr.net/npm/@ioai/wasm-zstd@latest/dist/wasm-zstd.wasm';

let readyPromise = null;
function ensureReady() {

	if ( ! readyPromise ) {

		readyPromise = ( async () => {

			log.log( 'ifcopenshell.init()…' );
			await ifcopenshell.init();
			log.log( 'configureCompressor →', ZSTD_WASM );
			configureCompressor( { wasmUrl: ZSTD_WASM } );
			log.log( 'ready' );

		} )();

	}

	return readyPromise;

}

self.onmessage = async ( e ) => {

	const { id, bytes, filename, kernel } = e.data;
	log.log( `msg #${ id } filename=${ filename } bytes=${ bytes?.byteLength } kernel=${ kernel }` );
	try {

		await ensureReady();
		const result = await convertBytes( bytes, filename, {
			geometryLibrary: kernel,
			onProgress: ( progress ) => self.postMessage( { id, type: 'progress', progress } ),
		} );
		log.log( `msg #${ id } done, sidecar=${ result.sidecarBytes.byteLength } bytes` );
		self.postMessage(
			{ id, type: 'result', ok: true, sidecarBytes: result.sidecarBytes },
			[ result.sidecarBytes.buffer ],
		);

	} catch ( err ) {

		log.error( `msg #${ id } failed:`, err );
		self.postMessage( { id, type: 'result', ok: false, error: err?.message ?? String( err ) } );

	}

};
