const MAX_FPS = 2000;
const BASELINE_FPS = 60;
const TICKS = [ 0, 30, 60, 120, 250, 500, 1000, 2000 ];
const LOG_K = 12;
const ARC_START = Math.PI * 5 / 6;
const ARC_SWEEP = Math.PI * 4 / 3;

function readColor( name, fallback ) {

	if ( typeof document === 'undefined' ) return fallback;
	return getComputedStyle( document.documentElement ).getPropertyValue( name ).trim() || fallback;

}

function fpsToT( fps ) {

	const value = Math.max( 0, Number( fps ) || 0 );
	const clamped = Math.min( value, MAX_FPS );
	return Math.log1p( clamped / LOG_K ) / Math.log1p( MAX_FPS / LOG_K );

}

function angleFor( t ) {

	return ARC_START + t * ARC_SWEEP;

}

/**
 * Semicircle FPS gauge. 60 fps is the baseline mark; the scale runs to 2000
 * on a log curve so a high viewer rate sits well past 60.
 */
export class FpsGauge {

	constructor( canvas ) {

		this.canvas = canvas;
		this.ctx = canvas.getContext( '2d' );
		this.fps = 0;
		this.display = 0;
		this._onResize = () => this.draw();
		window.addEventListener( 'resize', this._onResize );
		this._resizeObserver = typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver( () => this.draw() );
		this._resizeObserver?.observe( canvas );

	}

	update( fps ) {

		this.fps = Number.isFinite( fps ) && fps > 0 ? fps : 0;
		const reduced = typeof matchMedia === 'function'
			&& matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
		if ( reduced || this.display === 0 ) this.display = this.fps;
		else this.display += ( this.fps - this.display ) * 0.35;
		this.draw();

	}

	draw() {

		if ( ! this.ctx ) return;

		const rect = this.canvas.getBoundingClientRect();
		const width = Math.max( 1, Math.floor( rect.width ) );
		const height = Math.max( 1, Math.floor( rect.height ) );
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = Math.floor( width * dpr );
		this.canvas.height = Math.floor( height * dpr );
		this.ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		this.ctx.clearRect( 0, 0, width, height );

		const cx = width / 2;
		const cy = height * 0.64;
		const radius = Math.min( width * 0.36, height * 0.46 );
		const track = Math.max( 12, radius * 0.2 );
		const t = fpsToT( this.display );

		this.drawTrack( cx, cy, radius, track );
		this.drawValue( cx, cy, radius, track, t );
		this.drawTicks( cx, cy, radius, track );
		this.drawNeedle( cx, cy, radius, track, t );
		this.drawHub( cx, cy );
		this.drawReadout( cx, cy, radius );

	}

	drawTrack( cx, cy, radius, track ) {

		const ctx = this.ctx;
		ctx.lineCap = 'round';
		ctx.lineWidth = track;
		ctx.strokeStyle = readColor( '--dui-color-surface-pressed', '#1f2228' );
		ctx.beginPath();
		ctx.arc( cx, cy, radius, ARC_START, ARC_START + ARC_SWEEP, false );
		ctx.stroke();

	}

	drawValue( cx, cy, radius, track, t ) {

		if ( t <= 0 ) return;

		const ctx = this.ctx;
		const start = angleFor( 0 );
		const end = angleFor( t );
		const fill = this.display >= BASELINE_FPS ? '#3ecbff' : readColor( '--dui-color-danger', '#d4785a' );
		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineWidth = track;
		ctx.strokeStyle = fill;
		ctx.shadowColor = fill;
		ctx.shadowBlur = 10;
		ctx.beginPath();
		ctx.arc( cx, cy, radius, start, end, false );
		ctx.stroke();
		ctx.restore();

	}

	drawTicks( cx, cy, radius, track ) {

		const ctx = this.ctx;
		const inner = radius - track * 0.7;
		const outer = radius + track * 0.55;
		ctx.save();
		ctx.fillStyle = readColor( '--dui-color-text-subtle', '#8f98a6' );
		ctx.font = `500 ${ Math.max( 9, Math.round( radius * 0.11 ) ) }px ${ readColor( '--dui-font-ui', 'Nunito, sans-serif' ) }`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';

		for ( const fps of TICKS ) {

			const t = fpsToT( fps );
			const angle = angleFor( t );
			const cos = Math.cos( angle );
			const sin = Math.sin( angle );
			const baseline = fps === BASELINE_FPS;
			ctx.strokeStyle = baseline
				? readColor( '--dui-color-accent', '#39b54a' )
				: readColor( '--dui-color-border-strong', '#5b6472' );
			ctx.lineWidth = baseline ? 2 : 1;
			ctx.beginPath();
			ctx.moveTo( cx + cos * inner, cy + sin * inner );
			ctx.lineTo( cx + cos * outer, cy + sin * outer );
			ctx.stroke();

			const labelR = radius + track * 0.95;
			ctx.fillStyle = baseline
				? readColor( '--dui-color-accent', '#39b54a' )
				: readColor( '--dui-color-text-muted', '#9aa4b3' );
			ctx.fillText( String( fps ), cx + cos * labelR, cy + sin * labelR );

		}

		ctx.restore();

	}

	drawNeedle( cx, cy, radius, track, t ) {

		const ctx = this.ctx;
		const angle = angleFor( t );
		const tip = radius - track * 0.15;
		ctx.save();
		ctx.translate( cx, cy );
		ctx.rotate( angle );
		ctx.fillStyle = readColor( '--dui-color-text', '#d0d5dd' );
		ctx.beginPath();
		ctx.moveTo( tip, 0 );
		ctx.lineTo( - radius * 0.12, radius * 0.035 );
		ctx.lineTo( - radius * 0.12, - radius * 0.035 );
		ctx.closePath();
		ctx.fill();
		ctx.restore();

	}

	drawHub( cx, cy ) {

		const ctx = this.ctx;
		ctx.beginPath();
		ctx.fillStyle = readColor( '--dui-color-text', '#d0d5dd' );
		ctx.arc( cx, cy, 4.5, 0, Math.PI * 2 );
		ctx.fill();
		ctx.beginPath();
		ctx.fillStyle = readColor( '--dui-color-bg', '#26292f' );
		ctx.arc( cx, cy, 2, 0, Math.PI * 2 );
		ctx.fill();

	}

	drawReadout( cx, cy, radius ) {

		const ctx = this.ctx;
		const value = this.fps > 0 ? this.fps.toFixed( 0 ) : '—';
		ctx.save();
		ctx.textAlign = 'center';
		ctx.fillStyle = readColor( '--dui-color-text', '#d0d5dd' );
		ctx.font = `600 ${ Math.max( 22, Math.round( radius * 0.28 ) ) }px ${ readColor( '--dui-font-mono', 'Inconsolata, monospace' ) }`;
		ctx.fillText( value, cx, cy + radius * 0.28 );
		ctx.fillStyle = readColor( '--dui-color-text-muted', '#9aa4b3' );
		ctx.font = `500 ${ Math.max( 10, Math.round( radius * 0.12 ) ) }px ${ readColor( '--dui-font-ui', 'Nunito, sans-serif' ) }`;
		ctx.fillText( 'fps', cx, cy + radius * 0.46 );
		ctx.restore();

	}

	destroy() {

		window.removeEventListener( 'resize', this._onResize );
		this._resizeObserver?.disconnect();
		this._resizeObserver = null;

	}

}
