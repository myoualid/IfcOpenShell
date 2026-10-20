// Turns configuration.paths directories into the URLs the page loads.
// The HTML does not list these.

function dir( path ) {

	if ( ! path ) throw new Error( 'A package directory in configuration.paths is missing' );
	return path.endsWith( '/' ) ? path : `${ path }/`;

}

export function importsFromPaths( paths ) {

	const js = dir( paths.ifcopenshell );
	const wasm = dir( paths.wasm );
	const gui = dir( paths.gui );
	const layout = dir( paths.layout );
	return {
		'ifcopenshell': `${ js }index.js`,
		'ifcopenshell/geom': `${ js }geom/index.js`,
		'ifcopenshell/util': `${ js }util/index.js`,
		'@ifcopenshell/wasm': `${ wasm }browser.js`,
		'@ifcopenshell/wasm/api': `${ wasm }wasm/ifcopenshell_api.mjs`,
		'@aeco-dev/gui': `${ gui }gui.js`,
		'@aeco-dev/layout': `${ layout }layout.js`,
	};

}

export function stylesFromPaths( paths ) {

	return [
		`${ dir( paths.gui ) }gui.css`,
		`${ dir( paths.layout ) }layout.css`,
	];

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

export function installImports( paths ) {

	const map = document.createElement( 'script' );
	map.type = 'importmap';
	map.textContent = JSON.stringify( { imports: importsFromPaths( paths ) } );
	document.head.appendChild( map );

}

export function installStyles( paths ) {

	for ( const href of stylesFromPaths( paths ) ) {

		const link = document.createElement( 'link' );
		link.rel = 'stylesheet';
		link.href = href;
		document.head.appendChild( link );

	}

}
