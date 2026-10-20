import * as esbuild from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const watch = process.argv.includes( '--watch' );

const options = {
	absWorkingDir: root,
	entryPoints: {
		bonsai: 'src/gui.js',
		'bonsai-headless': 'src/index.js',
	},
	bundle: true,
	splitting: true,
	format: 'esm',
	outdir: 'build',
	entryNames: '[name]',
	target: 'es2022',
	sourcemap: true,
	packages: 'external',
	logLevel: 'info',
};

if ( watch ) {

	const ctx = await esbuild.context( options );
	await ctx.watch();

} else {

	await esbuild.build( options );

}
