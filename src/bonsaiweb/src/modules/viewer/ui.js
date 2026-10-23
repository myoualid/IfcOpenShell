import ops from '../../ops.js';
import { measure, projectPoint, resolvePick } from '../../tool/measure.js';
import { Viewer } from '../../tool/Viewer.js';

const BUTTONS = {
	RB_Section: 'section',
	RB_Fly: 'fly',
	RB_Ortho: 'ortho',
	RB_Grid: 'grid',
	RB_Axes: 'axes',
	RB_Fog: 'fog',
	RB_Xray: 'xray',
	RB_SelectionOutline: 'outline',
};

const MEASURE_BUTTONS = {
	RB_MeasureLength: 'length',
	RB_MeasureArea: 'area',
	RB_MeasureVolume: 'volume',
};

const GUIDE = {
	length: 'Length — click to place points. Backspace removes the last. Esc exits.',
	area: 'Area — click around a region. Backspace removes the last point. Esc exits.',
	volume: 'Volume — select the objects to measure. Esc exits.',
};

const CLICK_SLOP_PX = 4;

function ns( name ) {

	return document.createElementNS( 'http://www.w3.org/2000/svg', name );

}

class ViewerToolsUI {

	static id = 'viewer';

	constructor( { context } ) {

		this.context = context;
		this.tools = null;
		this.measureState = measure.snapshot();
		this.hint = document.createElement( 'div' );
		this.hint.id = 'viewer-tool-hint';
		this.hint.hidden = true;
		const viewport = context.dom?.viewport;
		viewport?.appendChild( this.hint );
		this.overlay = ns( 'svg' );
		this.overlay.id = 'measure-overlay';
		this.overlay.setAttribute( 'aria-hidden', 'true' );
		this.overlay.hidden = true;
		viewport?.appendChild( this.overlay );
		context.signals.viewerToolsChanged.add( ( state ) => this.syncTools( state ) );
		context.signals.measureChanged.add( ( state ) => this.syncMeasure( state ) );
		this._down = null;
		this._raf = 0;
		this.preview = null;
		this._hoverSerial = 0;
		const canvas = () => Viewer.get()?.canvas;
		viewport?.addEventListener( 'pointerdown', ( event ) => {

			if ( event.target !== canvas() ) return;
			this._down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;

		} );
		viewport?.addEventListener( 'pointermove', ( event ) => {

			if ( this._down || event.target !== canvas() ) return;
			this._hover( event, canvas() );

		} );
		viewport?.addEventListener( 'pointerup', ( event ) => {

			const down = this._down;
			this._down = null;
			if ( ! down || event.button !== 0 || event.target !== canvas() ) return;
			if ( Math.hypot( event.clientX - down.x, event.clientY - down.y ) > CLICK_SLOP_PX ) return;
			this._click( event, canvas() );

		} );
		document.addEventListener( 'keydown', ( event ) => this._key( event ) );

	}

	syncTools( state ) {

		this.tools = state;
		this._paintButtons();
		this._paintHint();

	}

	syncMeasure( state ) {

		this.measureState = state ?? measure.snapshot();
		this._paintButtons();
		this._paintHint();
		this._paintOverlay();
		const canvas = Viewer.get()?.canvas;
		if ( canvas ) {

			const placing = this.measureState.mode === 'length' || this.measureState.mode === 'area';
			canvas.style.cursor = placing ? 'crosshair' : '';

		}
		if ( this.measureState.mode ) this._watch();
		else if ( this._raf ) {

			cancelAnimationFrame( this._raf );
			this._raf = 0;

		}

	}

	_paintButtons() {

		const state = this.tools;
		if ( state ) {

			for ( const [ id, key ] of Object.entries( BUTTONS ) ) this._press( id, !! state[ key ] );

		}
		const mode = this.measureState?.mode ?? null;
		for ( const [ id, key ] of Object.entries( MEASURE_BUTTONS ) ) this._press( id, mode === key );

	}

	_press( id, on ) {

		const el = document.getElementById( id );
		if ( ! el ) return;
		const box = el.matches?.( 'input[type="checkbox"]' )
			? el
			: el.querySelector?.( 'input[type="checkbox"]' );
		if ( box ) {

			if ( box.checked !== on ) box.checked = on;
			return;

		}
		el.classList.toggle( 'Active', on );
		el.setAttribute( 'aria-pressed', String( on ) );

	}

	_paintHint() {

		const lines = [];
		if ( this.tools?.section ) lines.push( 'Section — click a surface to cut. Drag the arrow to slide it. Delete removes the last cut.' );
		if ( this.tools?.fly ) lines.push( 'Fly — WASD and QE move, the mouse looks, Shift boosts, Esc exits.' );
		const mode = this.measureState?.mode;
		if ( mode && ! this.tools?.fly ) {

			lines.push( GUIDE[ mode ] );
			for ( const line of this.measureState.lines ?? [] ) lines.push( line );
			if ( this.measureState.placement === 'plane' && ( this.measureState.points?.length ?? 0 ) > 0 ) {

				lines.push( 'Points sit on the horizontal plane through the last point.' );

			}

		}
		this.hint.hidden = lines.length === 0;
		this.hint.textContent = lines.join( '\n' );

	}

	_paintOverlay() {

		const state = this.measureState;
		const show = state?.mode === 'length' || state?.mode === 'area';
		this.overlay.hidden = ! show;
		this.overlay.replaceChildren();
		const viewer = Viewer.get();
		if ( ! show || ! viewer ) return;
		const last = state.points?.[ state.points.length - 1 ];
		for ( const seg of state.segments ?? [] ) {

			this._stroke( seg.a, seg.b, seg.color || '#f7fafc', seg.dashed );
			const a = projectPoint( viewer, seg.a );
			const b = projectPoint( viewer, seg.b );
			if ( ! a || ! b || ! seg.label ) continue;
			const text = ns( 'text' );
			text.setAttribute( 'x', ( a.x + b.x ) / 2 );
			text.setAttribute( 'y', ( a.y + b.y ) / 2 - 6 );
			text.setAttribute( 'fill', seg.color || '#f7fafc' );
			text.setAttribute( 'font-size', '11' );
			text.setAttribute( 'font-family', 'ui-monospace, Menlo, Consolas, monospace' );
			text.setAttribute( 'text-anchor', 'middle' );
			text.textContent = seg.label;
			this.overlay.append( text );

		}
		for ( const point of state.dots ?? [] ) {

			const screen = projectPoint( viewer, point );
			if ( ! screen ) continue;
			const dot = ns( 'circle' );
			dot.setAttribute( 'cx', screen.x );
			dot.setAttribute( 'cy', screen.y );
			dot.setAttribute( 'r', '4' );
			dot.setAttribute( 'fill', '#f6e05e' );
			this.overlay.append( dot );

		}
		const preview = this.preview?.point;
		if ( ! preview ) return;
		const screen = projectPoint( viewer, preview );
		if ( ! screen ) return;
		if ( last ) {

			const from = projectPoint( viewer, last );
			if ( from ) {

				const guide = ns( 'line' );
				guide.setAttribute( 'x1', from.x );
				guide.setAttribute( 'y1', from.y );
				guide.setAttribute( 'x2', screen.x );
				guide.setAttribute( 'y2', screen.y );
				guide.setAttribute( 'stroke', '#f6e05e' );
				guide.setAttribute( 'stroke-width', '1' );
				guide.setAttribute( 'stroke-dasharray', '3 3' );
				this.overlay.append( guide );

			}

		}
		const mark = ns( 'circle' );
		mark.setAttribute( 'cx', screen.x );
		mark.setAttribute( 'cy', screen.y );
		mark.setAttribute( 'r', '4' );
		mark.setAttribute( 'fill', 'none' );
		mark.setAttribute( 'stroke', '#f6e05e' );
		mark.setAttribute( 'stroke-width', '1.5' );
		this.overlay.append( mark );

	}

	_stroke( a, b, color, dashed ) {

		const from = projectPoint( Viewer.get(), a );
		const to = projectPoint( Viewer.get(), b );
		if ( ! from || ! to ) return;
		const line = ns( 'line' );
		line.setAttribute( 'x1', from.x );
		line.setAttribute( 'y1', from.y );
		line.setAttribute( 'x2', to.x );
		line.setAttribute( 'y2', to.y );
		line.setAttribute( 'stroke', color );
		line.setAttribute( 'stroke-width', '1.5' );
		if ( dashed ) line.setAttribute( 'stroke-dasharray', '4 3' );
		this.overlay.append( line );

	}

	_watch() {

		if ( this._raf || typeof requestAnimationFrame !== 'function' ) return;
		const tick = () => {

			if ( ! this.measureState?.mode ) {

				this._raf = 0;
				return;

			}
			this._paintOverlay();
			this._raf = requestAnimationFrame( tick );

		};
		this._raf = requestAnimationFrame( tick );

	}

	_click( event, canvas ) {

		const mode = measure.mode();
		if ( mode !== 'length' && mode !== 'area' ) return;
		if ( this.tools?.section || this.tools?.fly ) return;
		const rect = canvas.getBoundingClientRect();
		void ops.Viewer.AddMeasurePoint( {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
			alt: event.altKey,
		} );

	}

	_hover( event, canvas ) {

		const mode = measure.mode();
		if ( mode !== 'length' && mode !== 'area' ) {

			this.preview = null;
			return;

		}
		if ( this.tools?.section || this.tools?.fly ) return;
		const rect = canvas.getBoundingClientRect();
		const serial = ++ this._hoverSerial;
		const click = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
			alt: event.altKey,
		};
		void resolvePick( Viewer.get(), click, measure.snapshot().points ).then( ( hit ) => {

			if ( serial !== this._hoverSerial ) return;
			this.preview = hit;
			this._paintOverlay();

		} );

	}

	_key( event ) {

		if ( ! measure.mode() ) return;
		const tag = document.activeElement?.tagName;
		if ( tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable ) return;
		if ( event.key === 'Escape' ) {

			event.preventDefault();
			ops.Viewer.Measure( measure.mode() );

		} else if ( event.key === 'Backspace' && ( measure.mode() === 'length' || measure.mode() === 'area' ) ) {

			event.preventDefault();
			ops.Viewer.UndoMeasurePoint();

		}

	}

}

export default [ ViewerToolsUI ];
