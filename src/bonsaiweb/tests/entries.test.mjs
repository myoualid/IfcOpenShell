import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );

function specifiers( text, { dynamic = true } = {} ) {

	const out = [];
	for ( const match of text.matchAll( /from\s+['"]([^'"]+)['"]/g ) ) out.push( match[ 1 ] );
	for ( const match of text.matchAll( /import\s+['"]([^'"]+)['"]/g ) ) out.push( match[ 1 ] );
	if ( dynamic ) {

		for ( const match of text.matchAll( /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g ) ) out.push( match[ 1 ] );

	}

	return out;

}

function walk( entry, options ) {

	const seen = new Set();
	const bare = new Set();
	const files = [];

	function visit( file ) {

		const abs = resolve( file );
		if ( seen.has( abs ) ) return;
		seen.add( abs );
		files.push( abs );
		const text = readFileSync( abs, 'utf8' );
		for ( const spec of specifiers( text, options ) ) {

			if ( ! spec.startsWith( '.' ) ) {

				bare.add( spec );
				continue;

			}

			let next = resolve( dirname( abs ), spec );
			if ( ! /\.[cm]?js$/.test( next ) ) next += '.js';
			visit( next );

		}

	}

	visit( resolve( root, entry ) );
	return { files, bare };

}

const guiMarkers = [
	'@aeco-dev/gui',
	'@aeco-dev/layout',
];

describe( 'entry graphs', () => {

	it( 'the core entry does not reach gui or module ui', () => {

		const { files, bare } = walk( 'src/index.js' );
		for ( const marker of guiMarkers ) {

			assert.equal( bare.has( marker ), false, marker );

		}

		const ui = files.filter( ( file ) => file.replaceAll( '\\', '/' ).endsWith( '/src/gui.js' )
			|| file.replaceAll( '\\', '/' ).endsWith( '/ui.js' ) );
		assert.deepEqual( ui, [] );

	} );

	it( 'the operator registry stays off module ui', () => {

		const { files, bare } = walk( 'src/modules/operators.js' );
		for ( const marker of guiMarkers ) {

			assert.equal( bare.has( marker ), false, marker );

		}

		const ui = files.filter( ( file ) => file.replaceAll( '\\', '/' ).endsWith( '/ui.js' ) );
		assert.deepEqual( ui, [] );

	} );

	it( 'panel ui uses the ops singleton and operators do not import ui', () => {

		const panels = [
			'src/modules/project/ui.js',
			'src/modules/settings/ui.js',
			'src/modules/georeferencing/ui.js',
			'src/modules/properties/ui.js',
			'src/modules/spatial-hierarchy/ui.js',
			'src/modules/code.terminal/ui.js',
		];
		for ( const entry of panels ) {

			const { files } = walk( entry );
			const paths = files.map( ( file ) => file.replaceAll( '\\', '/' ) );
			assert.ok( paths.some( ( file ) => file.endsWith( '/src/ops.js' ) ), entry );
			assert.equal(
				paths.some( ( file ) => file.replaceAll( '\\', '/' ).endsWith( '/operators.js' ) ),
				false,
				entry,
			);

		}

		const { files } = walk( 'src/modules/operators.js' );
		const ui = files.filter( ( file ) => file.replaceAll( '\\', '/' ).endsWith( '/ui.js' ) );
		assert.deepEqual( ui, [] );

	} );

	it( 'gui entry reaches each module ui and the layout packages', () => {

		const { files, bare } = walk( 'src/gui.js' );
		const paths = files.map( ( file ) => file.replaceAll( '\\', '/' ) );
		for ( const entry of [
			'/src/modules/project/ui.js',
			'/src/modules/settings/ui.js',
			'/src/modules/georeferencing/ui.js',
			'/src/modules/spatial-hierarchy/ui.js',
			'/src/modules/properties/ui.js',
			'/src/modules/code.terminal/ui.js',
		] ) {

			assert.equal( paths.some( ( file ) => file.endsWith( entry ) ), true, entry );

		}

		assert.equal( bare.has( '@aeco-dev/gui' ), true );
		assert.equal( bare.has( '@aeco-dev/layout' ), true );

	} );

	it( 'the gui entry does not fetch ifcopenshell before the shell is drawn', () => {

		const { bare } = walk( 'src/gui.js', { dynamic: false } );
		assert.equal( bare.has( 'ifcopenshell' ), false );
		assert.equal( bare.has( 'ifcopenshell/geom' ), false );

	} );

} );
