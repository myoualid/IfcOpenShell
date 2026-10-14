import { createLogger } from '../util/log.js';

const log = createLogger( 'bonsai' );

export function watchSession( bonsai ) {

	const timing = new Map();
	const slot = ( key ) => {

		if ( ! timing.has( key ) ) timing.set( key, {} );
		return timing.get( key );

	};

	let currentKey = null;

	for ( const [ name, signal ] of Object.entries( bonsai.signals ) ) {

		if ( typeof signal?.add !== 'function' ) continue;
		signal.add( ( ...args ) => {

			const p = args[ 0 ];
			if ( name === 'modelLoadStarted' && p?.phase !== undefined ) {

				const pct = Math.round( ( p.ratio ?? 0 ) * 100 );
				log.log( `convert ${ pct }% — ${ p.phase }: ${ p.message ?? '' }` );
				const s = slot( currentKey ?? 'model' );
				if ( p.phase === 'parsing' && s.convertStart === undefined ) s.convertStart = performance.now();
				if ( p.phase === 'complete' ) s.convertEnd = performance.now();
				return;

			}

			if ( name === 'modelLoadStarted' ) {

				const key = p?.name ?? p?.url ?? 'model';
				currentKey = key;
				const s = slot( key );
				if ( p?.source === 'autoload' ) s.fetchStart = performance.now();
				if ( p?.source === 'file' ) s.streamStart = performance.now();

			}

			if ( name === 'modelLoaded' ) {

				const key = currentKey ?? 'model';
				const s = slot( key ) ?? {};
				const parts = [];
				if ( s.fetchStart !== undefined && s.convertStart !== undefined ) {

					parts.push( `fetch=${ ( s.convertStart - s.fetchStart ).toFixed( 0 ) }ms` );

				}

				if ( s.convertStart !== undefined && s.convertEnd !== undefined ) {

					parts.push( `convert=${ ( s.convertEnd - s.convertStart ).toFixed( 0 ) }ms` );

				}

				if ( s.streamStart !== undefined ) {

					parts.push( `stream+firstRender=${ ( performance.now() - s.streamStart ).toFixed( 0 ) }ms` );

				}

				const base = s.fetchStart ?? s.streamStart;
				if ( base !== undefined ) parts.push( `total=${ ( performance.now() - base ).toFixed( 0 ) }ms` );
				log.log( `modelLoaded ${ key } (${ parts.join( ' ' ) || '?' })`, p );
				return;

			}

			log.log( `${ name }`, ...args );

		} );

	}

	globalThis.addEventListener?.( 'unhandledrejection', ( e ) => {

		log.error( 'unhandled rejection:', e.reason );

	} );

}
