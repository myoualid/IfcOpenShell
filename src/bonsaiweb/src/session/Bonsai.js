import { Ops } from '../ops/Ops.js';
import { bindKeyboard } from '../ops/keyboard.js';
import { addSignals } from './signals.js';
import { activateStore, bindStore, createStore } from './store.js';
import tool from '../tool/index.js';
import { create, destroy } from '../viewer/host.js';

export { tool };

export class Bonsai {

	constructor( container ) {

		this.app = { container };
		this.signals = addSignals();
		this.store = activateStore( createStore() );
		bindStore( this.store, this.signals );

		this.ops = new Ops( this );

		this.viewer = null;
		this.canvas = null;
		this.init = null;
		this.tool = tool;

		this._resizeObserver = null;
		this._viewerUnsubs = [];

	}

	addSignal( signal ) {

		const { Signal } = globalThis.signals;
		if ( ! this.signals[ signal ] ) {

			this.signals[ signal ] = new Signal();

		}

		return this.signals[ signal ];

	}

	removeSignal( signal ) {

		delete this.signals[ signal ];

	}

	undo() {

		return this.ops.undo();

	}

	redo() {

		return this.ops.redo();

	}

	destroy() {

		this._resizeObserver?.disconnect();
		this.terminal?.terminalPanel?.destroy();
		for ( const unsubscribe of this._viewerUnsubs ) unsubscribe?.();
		this.canvas?.remove();
		destroy();
		this.viewer = null;

	}

}

export function createSession( container ) {

	const bonsai = new Bonsai( container );
	bindKeyboard( bonsai );
	return bonsai;

}

export async function attachViewer( bonsai, viewport ) {

	bonsai.app.viewport = viewport;
	bonsai.viewer = await create( viewport );
	bonsai.canvas = viewport.querySelector( '#viewer-canvas' );
	// Reports the viewport's CSS box. The viewer has no resize method; it
	// samples #viewer-canvas itself. Do not write canvas.width/height here.
	bonsai._resizeObserver = new ResizeObserver( ( entries ) => {

		const box = entries[ 0 ]?.contentRect;
		if ( ! box ) return;
		bonsai.signals.viewportResized.dispatch( {
			width: box.width,
			height: box.height,
		} );

	} );
	bonsai._resizeObserver.observe( viewport );
	bonsai.signals.viewerReady.dispatch( bonsai.viewer );
	bonsai.init = true;

}
