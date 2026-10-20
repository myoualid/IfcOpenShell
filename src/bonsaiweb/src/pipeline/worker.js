// Module loaded inside a classic worker (see worker-host.js) so the page
// import map applies. The main thread keeps its own ifcopenshell instance
// for live files; this one only tessellates .ifc → .ifcview.

import { createLogger } from '../util/log.js';
import { convertBytes, configureCompressor, warmRuntime } from './ifcopenshell/convert.js';

const log = createLogger( 'convert-worker' );
log.log( 'module loading…' );

self.addEventListener( 'unhandledrejection', ( ev ) => {

	log.error( 'unhandled rejection:', ev.reason );

} );

const ZSTD_WASM = 'https://cdn.jsdelivr.net/npm/@ioai/wasm-zstd@latest/dist/wasm-zstd.wasm';
configureCompressor( { wasmUrl: ZSTD_WASM } );
log.log( 'imports resolved' );

// A trap inside the wasm (out-of-bounds access, unreachable) leaves the
// runtime's heap in an unknown state, so every later call is suspect too.
function isFatalWasmError( err ) {

	for ( let e = err; e; e = e.cause ) {

		if ( typeof WebAssembly !== 'undefined' && e instanceof WebAssembly.RuntimeError ) return true;

	}

	return /memory access out of bounds|unreachable|table index is out of bounds/i.test( err?.message ?? '' );

}

let poisoned = false;

export async function handleMessage( e ) {

	const { id, type, bytes, filename, kernel, numThreads, settings, exclude, streamParts } = e.data;
	if ( type === 'warm' ) {

		log.log( `warm kernel=${ kernel ?? 'opencascade' }` );
		try {

			await warmRuntime( kernel ?? 'opencascade' );
			self.postMessage( { id, type: 'warmed', ok: true } );

		} catch ( err ) {

			log.error( 'warm failed:', err );
			self.postMessage( { id, type: 'warmed', ok: false, error: err?.message ?? String( err ) } );

		}

		return;

	}

	log.log( `msg #${ id } filename=${ filename } bytes=${ bytes?.byteLength } kernel=${ kernel }` );
	if ( poisoned ) {

		const transfer = bytes?.buffer ? [ bytes.buffer ] : [];
		self.postMessage( { id, type: 'result', ok: false, fatal: true, bytes, error: 'convert worker runtime crashed earlier' }, transfer );
		return;

	}

	try {

		const result = await convertBytes( bytes, filename, {
			kernel,
			numThreads,
			settings,
			exclude,
			onProgress: ( progress ) => self.postMessage( { id, type: 'progress', progress } ),
			onPart: streamParts
				? ( partBytes ) => {

					const transfer = partBytes?.buffer ? [ partBytes.buffer ] : [];
					self.postMessage( { id, type: 'part', bytes: partBytes }, transfer );

				}
				: undefined,
		} );
		log.log( `msg #${ id } done, sidecar=${ result.sidecarBytes.byteLength } bytes` );
		const payload = {
			id,
			type: 'result',
			ok: true,
			sidecarBytes: result.sidecarBytes,
			meshCount: result.meshCount,
			productCount: result.productCount,
			timings: result.timings,
			numThreads: result.numThreads,
		};
		const transfer = result.sidecarBytes?.buffer ? [ result.sidecarBytes.buffer ] : [];
		self.postMessage( payload, transfer );

	} catch ( err ) {

		const fatal = isFatalWasmError( err );
		log.error( `msg #${ id } failed${ fatal ? ' (fatal wasm error)' : '' }:`, err );
		if ( fatal ) {

			poisoned = true;
			// Hand the IFC back so the host can retry on a fresh worker without a copy.
			const transfer = bytes?.buffer ? [ bytes.buffer ] : [];
			self.postMessage( { id, type: 'result', ok: false, fatal: true, bytes, error: err?.message ?? String( err ) }, transfer );
			return;

		}

		self.postMessage( { id, type: 'result', ok: false, error: err?.message ?? String( err ) } );

	}

}
