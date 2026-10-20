import { Signals, addSignal, logSignals, removeSignal } from './context/signals.js';
import { Store, listenStore } from './context/store.js';
import { registerOperators } from './modules/operators.js';
import ops, { bindKeyboard } from './ops.js';
import tool from './tool/index.js';
import { create as createViewer, destroy } from './tool/Viewer.js';
import { createLogger } from './util/log.js';

export { tool };

const log = createLogger( 'bonsai' );
const ms = ( start ) => `${ ( performance.now() - start ).toFixed( 0 ) }ms`;

export class Bonsai {

	constructor( container, configuration = {}, viewport ) {

		this.context = {
			signals: Signals,
			store: Store,
			dom: { container, viewport },
		};

		this.ops = ops;

		this.tool = tool;

		this.paths = configuration.paths;
		this.context.geometry = configuration.geometry ?? null;
		this.tool.Loader.configure( configuration.geometry );

		listenStore( this.context.signals );

		registerOperators( configuration.app?.CoreModules );

		bindKeyboard();

		logSignals( this.context.signals );

		this.viewer = null;

	}

	async start() {

		const t = performance.now();
		const { context } = this;
		const viewerInstance = await createViewer( context.dom.viewport, this.paths );
		this.viewer = viewerInstance;

		// Reports the viewport's CSS box. The viewer has no resize method; it
		// samples #viewer-canvas itself. Do not write canvas.width/height here.
		this._resizeObserver = new ResizeObserver( ( entries ) => {

			const box = entries[ 0 ]?.contentRect;
			if ( ! box ) return;

		} );
		this._resizeObserver.observe( viewerInstance.canvas );

		viewerInstance.onSelect( ( pick ) => {

			ops.execute( 'viewer.object_picked', context, pick );

		} );
		viewerInstance.onSelectionChange( ( ids ) => {

			ops.execute( 'viewer.selection_changed', context, ids );

		} );
		viewerInstance.onModelLoaded( ( detail ) => {

			ops.execute( 'project.model_loaded', context, detail );

		} );

		const viewport = context.dom.viewport;
		if ( viewport ) {

			tool.Loader.enableDragDrop( viewport, ( file ) => {

				ops.execute( 'load.ifc', context, file );

			} );

		}

		context.signals.viewerReady.dispatch( viewerInstance );
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

		this._resizeObserver?.disconnect();
		this.terminal?.terminalPanel?.destroy();
		this.context.profiling?.profilerPanel?.destroy();
		destroy();
		this.viewer = null;

	}

}

// Headless entry
export async function start( container = document.body, configuration = {} ) {

	const bonsai = new Bonsai( container, configuration, container );

	await bonsai.start();

	return bonsai;

}
