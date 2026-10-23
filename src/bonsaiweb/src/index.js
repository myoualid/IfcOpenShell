import { context } from './context/context.js';
import { addSignal, logSignals, removeSignal } from './context/signals.js';
import { store } from './context/store.js';
import { setBundledDropboxClientId } from './modules/dropbox/const.js';
import { registerOperators } from './modules/operators.js';
import { publishModelLoaded, publishPick, publishSelection } from './modules/viewer/events.js';
import ops, { bindKeyboard } from './ops.js';
import tool from './tool/index.js';
import { createViewer, destroyViewer } from './tool/Viewer.js';
import { createLogger } from './util/log.js';

export { tool };

const log = createLogger( 'bonsai' );
const ms = ( start ) => `${ ( performance.now() - start ).toFixed( 0 ) }ms`;

export class Bonsai {

	constructor( container, configuration = {}, viewport ) {

		this.context = context;
		context.dom = { container, viewport };

		this.store = store;

		this.ops = ops;

		this.tool = tool;

		setBundledDropboxClientId( configuration.dropbox?.clientId );
		this.paths = configuration.paths;
		this.context.geometry = configuration.geometry ?? null;
		this.tool.Loader.usePaths( configuration.paths );
		this.tool.Loader.configure( configuration.geometry );

		registerOperators( configuration.app?.CoreModules );

		bindKeyboard();

		logSignals( this.context.signals );

	}

	async start() {

		const t = performance.now();
		const { context } = this;
		// The viewer has no resize method; it samples #viewer-canvas itself.
		const viewer = await createViewer( context.dom.viewport, this.paths );

		viewer.onSelect( publishPick );
		viewer.onSelectionChange( publishSelection );
		viewer.onModelLoaded( publishModelLoaded );

		const viewport = context.dom.viewport;
		if ( viewport ) {

			tool.Loader.enableDragDrop( viewport, ( payload ) => {

				if ( payload?.dropbox ) {

					ops.Dropbox.OpenFile( payload.dropbox.path, payload.dropbox.name );
					return;

				}

				if ( payload?.entries ) {

					ops.Project.OpenBag( payload.entries, payload.label );
					return;

				}

				if ( payload?.files ) {

					for ( const file of payload.files ) ops.Project.LoadIfc( file );
					return;

				}

				const file = payload?.file ?? payload;
				if ( file ) ops.Project.LoadIfc( file );

			} );

		}

		context.signals.viewerReady.dispatch( viewer );
		log.log( `boot: viewer ready in ${ ms( t ) }` );

		const ifcopenshell = await import( 'ifcopenshell' );
		await ifcopenshell.init();
		log.log( `boot: ifcopenshell ready in ${ ms( t ) }` );
		context.signals.appReady.dispatch( true );
		this.tool.Loader.warmRuntimes();

	}

	addSignal( signal ) {

		return addSignal( signal );

	}

	removeSignal( signal ) {

		return removeSignal( signal );

	}

	destroy() {

		this.terminal?.terminalPanel?.destroy();
		this.context.profiling?.profilerPanel?.destroy();
		destroyViewer();

	}

}

// Headless entry
export async function start( container = document.body, configuration = {} ) {

	const bonsai = new Bonsai( container, configuration, container );

	await bonsai.start();

	return bonsai;

}
