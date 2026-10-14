// Shared timestamped logger. Every bonsai log line is `[HH:MM:SS.sss +N.NNNs] [tag] …`
// so you can see wall-clock + elapsed since app start without staring at
// Chrome's gray timestamp column.

const t0 = ( typeof performance !== 'undefined' ? performance.now() : Date.now() );

function stamp() {

	const d = new Date();
	const hh = String( d.getHours() ).padStart( 2, '0' );
	const mm = String( d.getMinutes() ).padStart( 2, '0' );
	const ss = String( d.getSeconds() ).padStart( 2, '0' );
	const ms = String( d.getMilliseconds() ).padStart( 3, '0' );
	const dt = ( ( ( typeof performance !== 'undefined' ? performance.now() : Date.now() ) - t0 ) / 1000 ).toFixed( 3 );
	return `[${ hh }:${ mm }:${ ss }.${ ms } +${ dt }s]`;

}

export function createLogger( tag ) {

	const prefix = `[${ tag }]`;
	return {
		log: ( ...a ) => console.log( stamp(), prefix, ...a ),
		warn: ( ...a ) => console.warn( stamp(), prefix, ...a ),
		error: ( ...a ) => console.error( stamp(), prefix, ...a ),
	};

}
