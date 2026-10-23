// This file was generated with the assistance of an AI coding tool.

// One ifcopenshell runtime per thread. The standalone build (dist/module/)
// bundles the ifcopenshell JS, so its own import.meta.url no longer points at
// the wasm files. scripts/build.mjs defines BONSAI_IFCOPENSHELL_WASM as their
// CDN directory, and init() is pointed there instead.

let runtime = null;

async function standaloneWasmAssets( base ) {

	const [ wasm, api, manifest ] = await Promise.all( [
		import( `${ base }ifcopenshell_wasm.mjs` ),
		import( '@ifcopenshell/wasm/api' ),
		fetch( `${ base }ifcopenshell_plugins.json` ).then( ( response ) => response.json() ),
	] );
	return {
		initModule: wasm.default,
		wasmUrl: `${ base }ifcopenshell_wasm.wasm`,
		pluginBaseUrl: base,
		manifest,
		createIfcOpenshellModule: api.createIfcOpenshellModule,
	};

}

export function initIfcOpenShell() {

	runtime ??= import( 'ifcopenshell' ).then( async ( ifcopenshell ) => {

		const base = globalThis.BONSAI_IFCOPENSHELL_WASM;
		if ( ! base ) return ifcopenshell.init();
		return ifcopenshell.init( { wasmAssets: await standaloneWasmAssets( base ) } );

	} );
	return runtime;

}
