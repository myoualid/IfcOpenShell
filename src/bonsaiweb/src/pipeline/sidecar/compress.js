/** Desktop offline bake level (SidecarCache.cpp). */
export const SIDECAR_ZSTD_LEVEL = 19;
/** Interactive web bake — same frame format, much faster compression. */
export const SIDECAR_ZSTD_WEB_LEVEL = 3;
let zstdModuleUrl = null;
let compressBlock = null;
let configuredInit = null;
let initPromise = null;
/**
 * Provide the wasm-zstd module and WASM asset before the first compress call.
 * `moduleUrl` is the package entry; `wasmUrl` or `wasmBinary` is what that module inits with.
 * Both come from configuration.paths, resolved by dependencyUrls().
 */
export function configureCompressor( { moduleUrl, ...initOptions } = {} ) {

	if ( moduleUrl ) zstdModuleUrl = moduleUrl;
	configuredInit = initOptions;
	initPromise = null;

}

async function ensureZstdReady() {

	if ( ! initPromise ) {

		initPromise = ( async () => {

			if ( ! zstdModuleUrl || ! configuredInit || ( ! configuredInit.wasmUrl && ! configuredInit.wasmBinary ) ) {

				throw new Error( 'Sidecar compressor needs wasm-zstd assets. Call configureCompressor({ moduleUrl, wasmUrl }) ' +
					'with the URLs from configuration.paths before the first IFC conversion.' );

			}

			const mod = await import( zstdModuleUrl );
			compressBlock = mod.compress;
			await mod.init( configuredInit );

		} )();

	}

	await initPromise;

}

/** Compress one zstd frame (sidecar blocks and per-chunk geometry). */
export async function compressSidecarBlock( raw, level = SIDECAR_ZSTD_WEB_LEVEL ) {

	if ( raw.byteLength === 0 ) {

		return new Uint8Array( 0 );

	}

	await ensureZstdReady();
	return compressBlock( raw, level );

}

/** Preload wasm-zstd so the first IFC tessellation does not pay init latency. */
export function warmSidecarCompressor() {

	void ensureZstdReady().catch( () => {
		/* caller will see the error on first compress */
	} );

}
