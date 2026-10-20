// Classic-worker bootstrap that gives worker.js the page import map.
// Module workers do not see <script type="importmap">, and the ifcopenshell
// package imports bare `@ifcopenshell/wasm` specifiers. es-module-shims runs
// in shim mode inside a worker (there is no document) and then native-imports
// the wasm glue from the same URLs the page already loaded, so spawn stays cheap.
// The blob worker has no base URL of its own, so every URL here is absolute.

// Bundled callers pass `shimUrl` and `assets` from configuration.paths.
// import.meta.url then points into build/, so this file does not choose a CDN.

function absoluteImportMap( map, base ) {

	const imports = {};
	for ( const [ key, value ] of Object.entries( map?.imports ?? {} ) ) {

		imports[ key ] = new URL( value, base ).href;

	}

	return { imports };

}

export function readPageImportMap() {

	const node = document.querySelector( 'script[type="importmap"]' );
	if ( ! node?.textContent ) {

		throw new Error( 'IfcOpenShell worker needs the page import map' );

	}

	return absoluteImportMap( JSON.parse( node.textContent ), document.baseURI );

}

export function createIfcOpenShellWorker( moduleUrl, { shimUrl, assets } = {} ) {

	if ( ! shimUrl ) throw new Error( 'convert worker needs a shim URL' );
	if ( ! assets?.zstdModule || ! assets?.zstdWasm ) throw new Error( 'convert worker needs zstd paths' );
	const importMap = readPageImportMap();
	const source = `
		self.bonsaiAssets = ${ JSON.stringify( assets ) };
		let installed = false;
		const pending = [];
		self.addEventListener( 'message', ( event ) => {
			if ( ! installed ) pending.push( event.data );
		} );
		importScripts( ${ JSON.stringify( shimUrl ) } );
		importShim.addImportMap( ${ JSON.stringify( importMap ) } );
		importShim( ${ JSON.stringify( moduleUrl ) } ).then( ( mod ) => {
			if ( typeof mod.handleMessage !== 'function' ) {
				throw new Error( 'convert worker missing handleMessage' );
			}
			let chain = Promise.resolve();
			const enqueue = ( data ) => {
				chain = chain.then( () => mod.handleMessage( { data } ) );
			};
			self.onmessage = ( event ) => enqueue( event.data );
			installed = true;
			for ( const data of pending ) enqueue( data );
		} ).catch( ( err ) => {
			setTimeout( () => { throw err; }, 0 );
		} );
	`;
	const blob = new Blob( [ source ], { type: 'text/javascript' } );
	return new Worker( URL.createObjectURL( blob ) );

}
