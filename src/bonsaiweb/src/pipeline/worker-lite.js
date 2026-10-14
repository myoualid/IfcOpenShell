// Module worker: runs the ifc-lite geometry pipeline off the main thread.
// Replaces ConvertWorker.js's ifcopenshell-based path. The main thread
// still owns the ifcopenshell instance for property/pset/qto lookups —
// this worker no longer loads ifcopenshell at all.

import { createLogger } from '../util/log.js';
import { convertBytes, configureCompressor } from './lite/convert.js';

const log = createLogger( 'convert-worker-ifclite' );
log.log( 'module loading…' );

self.addEventListener( 'unhandledrejection', ( ev ) => {

	log.error( 'unhandled rejection:', ev.reason );

} );

log.log( 'imports resolved' );

// The .ifcview sidecar writer zstd-compresses chunks; it needs wasm-zstd
// resolved before the first conversion. Same wiring as ConvertWorker.js.
const ZSTD_WASM = 'https://cdn.jsdelivr.net/npm/@ioai/wasm-zstd@latest/dist/wasm-zstd.wasm';
configureCompressor( { wasmUrl: ZSTD_WASM } );

self.onmessage = async ( e ) => {

	const { id, bytes, filename } = e.data;
	log.log( `msg #${ id } filename=${ filename } bytes=${ bytes?.byteLength }` );
	try {

		const result = await convertBytes( bytes, filename, {
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
