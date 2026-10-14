import { createLogger } from '../util/log.js';
import { registerOperators } from '../modules/registry.js';
import { addSignals } from '../session/signals.js';
import { Bonsai, attachViewer, createSession, tool } from '../session/Bonsai.js';
import { watchSession } from '../session/watch.js';
import { bootRuntime } from './runtime.js';

export { addSignals, Bonsai, registerOperators, tool };

const log = createLogger( 'bonsai' );
const ms = ( start ) => `${ ( performance.now() - start ).toFixed( 0 ) }ms`;

export async function start( container = document.body, configuration = {} ) {

	const tBoot = await bootRuntime( { gui: false } );

	const geometry = tool.Loader.configure( configuration.geometry );
	log.log( `geometry: engine=${ geometry.engine } kernel=${ geometry.kernel } thread=${ geometry.thread }` );
	const bonsai = createSession( container );

	const tViewer = performance.now();
	await attachViewer( bonsai, container );
	log.log( `boot: viewer ready in ${ ms( tViewer ) }` );
	log.log( `boot total: ${ ms( tBoot ) }` );

	registerOperators( bonsai );
	watchSession( bonsai );
	bonsai.signals.appReady.dispatch( true );
	return bonsai;

}
