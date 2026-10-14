import { StatusBar } from '@aeco-dev/gui';

export function createProgress( footer ) {

	const bar = new StatusBar( { initialText: 'Starting Bonsai Web…', zIndex: 5 } );
	bar.parentContainer = footer;

	let timer = null;
	let message = '';

	function clearTimer() {

		if ( ! timer ) return;
		clearTimeout( timer );
		timer = null;

	}

	const progress = {
		show( nextMessage, ratio ) {

			clearTimer();
			if ( nextMessage !== undefined ) message = nextMessage;
			const indeterminate = ratio === undefined || ratio === null || Number.isNaN( ratio );
			bar.dom.classList.toggle( 'is-indeterminate', indeterminate );
			if ( indeterminate ) {

				bar.update( 0, message );
				if ( bar.percentageElement ) bar.percentageElement.textContent = '';

			} else {

				bar.update( Math.max( 0, Math.min( 1, ratio ) ), message );

			}

		},

		settle( nextMessage, delay = 700 ) {

			this.show( nextMessage, 1 );
			timer = setTimeout( () => this.show( 'Ready', 1 ), delay );

		},

		settleIfCurrent( nextMessage, delay = 250 ) {

			if ( message !== nextMessage ) return;
			this.settle( nextMessage, delay );

		},
	};

	return progress;

}

export function installFetchProgress( progress ) {

	if ( globalThis.__bonsaiFetchProgress ) return;
	globalThis.__bonsaiFetchProgress = true;

	let fetchToken = 0;
	const origFetch = globalThis.fetch.bind( globalThis );
	globalThis.fetch = async ( input, init ) => {

		const url = typeof input === 'string' ? input : ( input && input.url ) || '';
		const isTrackable = /\.(ifc|ifcview|ifczip|json|wasm)(\?|$)/i.test( url );
		const res = await origFetch( input, init );
		if ( ! isTrackable || ! res.body || ! res.ok ) return res;

		const total = Number( res.headers.get( 'content-length' ) ) || 0;
		const name = url.split( '/' ).pop().split( '?' )[ 0 ];
		const label = `Downloading ${ name }…`;
		const token = ++ fetchToken;
		let received = 0;
		const reader = res.body.getReader();
		const finish = () => {

			if ( token === fetchToken ) progress.settleIfCurrent( label );

		};

		const stream = new ReadableStream( {
			async start( controller ) {

				progress.show( label, total ? 0 : null );
				try {

					while ( true ) {

						const { done, value } = await reader.read();
						if ( done ) break;
						received += value.byteLength;
						if ( total && token === fetchToken ) {

							progress.show( label, received / total );

						}

						controller.enqueue( value );

					}

					controller.close();

				} catch ( err ) {

					controller.error( err );

				} finally {

					finish();

				}

			},
			cancel( reason ) {

				reader.cancel( reason );
				finish();

			},
		} );
		return new Response( stream, {
			headers: res.headers,
			status: res.status,
			statusText: res.statusText,
		} );

	};

}

export function bindModelProgress( bonsai, progress ) {

	bonsai.signals.modelLoadStarted.add( ( payload ) => {

		if ( payload?.phase !== undefined ) {

			const label = payload.phase === 'parsing' ? 'Parsing IFC'
				: payload.phase === 'parsed' ? 'Parsed IFC'
					: payload.phase === 'tessellating' ? 'Tessellating geometry'
						: payload.phase === 'serializing' ? 'Writing .ifcview'
							: payload.phase === 'complete' ? 'Conversion complete'
								: `Converting (${ payload.phase })`;
			const suffix = payload.message ? ` — ${ payload.message }` : '';
			progress.show( `${ label }${ suffix }`, payload.ratio );
			return;

		}

		const name = payload?.name ?? payload?.url?.split( '/' ).pop() ?? 'model';
		progress.show( `Opening ${ name }…`, null );

	} );

	bonsai.signals.modelLoaded.add( ( payload ) => {

		const name = payload?.name ?? 'model';
		progress.settle( `Model loaded (${ name })`, 1200 );

	} );

	bonsai.signals.modelLoadedToGPU.add( ( payload ) => {

		if ( payload?.ok === false ) progress.settle( 'Model load failed', 1500 );
		else progress.settle( 'Model uploaded to GPU', 900 );

	} );

	bonsai.signals.liveIfcReady.add( ( payload ) => {

		const name = payload?.file?.name ?? 'model';
		progress.settle( `Ready — ${ name }`, 700 );

	} );

}
