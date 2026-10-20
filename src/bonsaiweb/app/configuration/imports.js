// Turns configuration.paths directories into the URLs the page loads.
// The HTML does not list these.

function dir( path ) {

	if ( ! path ) throw new Error( 'A package directory in configuration.paths is missing' );
	return path.endsWith( '/' ) ? path : `${ path }/`;

}

export function viewerScripts( paths ) {

	const base = dir( paths.viewer );
	return [ `${ base }IfcViewerWeb.js`, `${ base }ifcviewer.js` ];

}

// File names for the pipeline dependencies. Callers pass these URLs through;
// the pipeline modules do not pick a CDN themselves.
export function dependencyUrls( paths ) {

	const zstd = dir( paths.zstd );
	const fzstd = dir( paths.fzstd );
	const shim = dir( paths.shim );
	return {
		zstdModule: `${ zstd }index.js`,
		zstdWasm: `${ zstd }wasm-zstd.wasm`,
		fzstdModule: `${ fzstd }index.mjs`,
		shim: `${ shim }es-module-shims.wasm.js`,
	};

}
