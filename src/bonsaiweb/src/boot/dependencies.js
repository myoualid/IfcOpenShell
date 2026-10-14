import { fromRoot } from '../root.js';

async function getDeps() {

	const res = await fetch( fromRoot( 'src/dependencies.json' ) );
	return res.json();

}

function appendScript( src ) {

	return new Promise( ( resolve, reject ) => {

		const s = document.createElement( 'script' );
		s.src = src;
		s.onload = resolve;
		s.onerror = reject;
		document.head.appendChild( s );

	} );

}

export async function loadDependencies( { gui = true } = {} ) {

	const { styles, scripts, guiScripts } = await getDeps();

	if ( gui ) {

		for ( const href of styles ) {

			const link = document.createElement( 'link' );
			link.rel = 'stylesheet';
			link.href = href;
			document.head.appendChild( link );

		}

	}

	for ( const src of scripts ) {

		await appendScript( src );

	}

	if ( gui ) {

		for ( const src of guiScripts ) {

			await appendScript( src );

		}

	}

	return true;

}
