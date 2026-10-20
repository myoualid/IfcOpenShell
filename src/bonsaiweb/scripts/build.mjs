import * as esbuild from 'esbuild';
import { copyFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const watch = process.argv.includes( '--watch' );

async function copyAssets() {

	await copyFile(
		resolve( root, 'src/paths.js' ),
		resolve( root, 'dist/paths.js' ),
	);
	await copyFile(
		resolve( root, 'app/files/ifc/window_wall.ifc' ),
		resolve( root, 'dist/window_wall.ifc' ),
	);

}

const options = {
	absWorkingDir: root,
	entryPoints: {
		bonsai: 'src/gui.js',
		'bonsai-headless': 'src/index.js',
		'convert-worker': 'src/pipeline/worker.js',
		'convert-main': 'src/pipeline/main-thread.js',
	},
	bundle: true,
	format: 'esm',
	outdir: 'dist',
	entryNames: '[name]',
	target: 'es2022',
	sourcemap: true,
	packages: 'external',
	logLevel: 'info',
	plugins: [
		{
			name: 'copy-assets',
			setup( build ) {

				build.onEnd( async ( result ) => {

					if ( result.errors.length ) return;
					await copyAssets();

				} );

			},
		},
	],
};

if ( watch ) {

	const ctx = await esbuild.context( options );
	await ctx.watch();

} else {

	await rm( resolve( root, 'dist' ), { recursive: true, force: true } );
	await esbuild.build( options );

}
