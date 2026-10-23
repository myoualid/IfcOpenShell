import * as esbuild from 'esbuild';
import { copyFile, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const watch = process.argv.includes( '--watch' );

async function copyAssets( outdir ) {

	await copyFile(
		resolve( root, 'app/files/ifc/window_wall.ifc' ),
		resolve( root, outdir, 'window_wall.ifc' ),
	);

}

const common = {
	absWorkingDir: root,
	bundle: true,
	format: 'esm',
	outdir: 'dist',
	entryNames: '[name]',
	target: 'es2022',
	sourcemap: true,
	packages: 'external',
	logLevel: 'info',
};

// bonsai and gui share one chunk, so both entries see the same context, store, and ops.
const host = {
	...common,
	entryPoints: {
		bonsai: 'src/index.js',
		gui: 'src/gui.js',
	},
	splitting: true,
	plugins: [
		{
			name: 'copy-assets',
			setup( build ) {

				build.onEnd( async ( result ) => {

					if ( result.errors.length ) return;
					await copyAssets( build.initialOptions.outdir );

				} );

			},
		},
	],
};

// The convert worker and its main-thread twin are loaded by URL, one file each.
const pipeline = {
	...common,
	entryPoints: {
		'convert-worker': 'src/pipeline/worker.js',
		'convert-main': 'src/pipeline/main-thread.js',
	},
};

// dist/module/ is the same build with every package inlined, so a page needs
// no import map. Only the ifcopenshell wasm files stay on the CDN, at the
// version the bundled glue was built against (src/runtime.js).
const { version: wasmVersion } = JSON.parse(
	await readFile( resolve( root, 'node_modules/@ifcopenshell/wasm/package.json' ), 'utf8' ),
);
const inline = {
	outdir: 'dist/module',
	packages: 'bundle',
	// Optional widgets @aeco-dev/gui imports lazily. Bonsai Web does not use them.
	external: [ 'chart.js/*', 'ag-grid-community', 'jsgantt-improved' ],
	define: {
		'globalThis.BONSAI_IFCOPENSHELL_WASM': JSON.stringify( `https://cdn.jsdelivr.net/npm/@ifcopenshell/wasm@${ wasmVersion }/wasm/` ),
	},
};
// ifcopenshell only imports the package root to find its wasm files, which
// src/runtime.js passes in. Inlining it would pull in the 6 MB wasm glue.
const wasmRootStub = {
	name: 'ifcopenshell-wasm-root',
	setup( build ) {

		build.onResolve( { filter: /^@ifcopenshell\/wasm$/ }, () => ( { path: 'wasm-root', namespace: 'stub' } ) );
		build.onLoad( { filter: /.*/, namespace: 'stub' }, () => ( {
			contents: 'export function resolveWasmAssets() { throw new Error( "standalone build: pass wasmAssets to init()" ); }',
		} ) );

	},
};
const builds = [
	host,
	pipeline,
	{ ...host, ...inline, plugins: [ ...host.plugins, wasmRootStub ] },
	{ ...pipeline, ...inline, plugins: [ wasmRootStub ] },
];

if ( watch ) {

	for ( const options of builds ) await ( await esbuild.context( options ) ).watch();

} else {

	await rm( resolve( root, 'dist' ), { recursive: true, force: true } );
	await Promise.all( builds.map( ( options ) => esbuild.build( options ) ) );

}
