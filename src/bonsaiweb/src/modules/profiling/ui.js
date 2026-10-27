import {
	Canvas,
	Card,
	Caption,
	FloatingWindow,
	StackPanel,
	Text,
} from '@aeco-dev/gui';

import { Viewer } from '../../tool/Viewer.js';
import { FpsGauge } from './fps-gauge.js';
import { ViewerMetrics, formatFps, formatMs } from './metrics.js';
import { RenderFooter } from './render-footer.js';

const RIBBON_BUTTON_ID = 'RB_Profiler';
const FOOTER_ID = 'ProfilerFooter';

function row( ...children ) {

	return new StackPanel( { isVertical: false } )
		.gap( '0.5rem' )
		.setStyle( 'alignItems', [ 'center' ] )
		.add( ...children );

}

function column( ...children ) {

	return new StackPanel( { isVertical: true } ).gap( '0.625rem' ).add( ...children );

}

function fpsTone( fps ) {

	if ( ! Number.isFinite( fps ) || fps <= 0 ) return '';
	if ( fps >= 50 ) return 'is-good';
	if ( fps >= 30 ) return 'is-ok';
	return 'is-low';

}

const SCALE_STEPS = [ 60, 120, 240, 500, 1000, 2000 ];

function cssColor( name, fallback ) {

	return getComputedStyle( document.documentElement ).getPropertyValue( name ).trim() || fallback;

}

function scaleMax( series ) {

	const peak = series.reduce( ( max, value ) => Math.max( max, value ), 0 );
	for ( const step of SCALE_STEPS ) {

		if ( peak <= step ) return step;

	}

	return SCALE_STEPS[ SCALE_STEPS.length - 1 ];

}

function scaleTicks( max ) {

	if ( max <= 60 ) return [ 0, 30, 60 ];
	if ( max <= 120 ) return [ 0, 60, 120 ];
	if ( max <= 240 ) return [ 0, 120, 240 ];
	if ( max <= 500 ) return [ 0, 60, 250, 500 ];
	if ( max <= 1000 ) return [ 0, 60, 500, 1000 ];
	return [ 0, 60, 1000, 2000 ];

}

function drawSparkline( canvas, series ) {

	const ctx = canvas.getContext( '2d' );
	if ( ! ctx ) return;

	const rect = canvas.getBoundingClientRect();
	const width = Math.max( 1, Math.floor( rect.width ) );
	const height = Math.max( 1, Math.floor( rect.height ) );
	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.floor( width * dpr );
	canvas.height = Math.floor( height * dpr );
	ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
	ctx.clearRect( 0, 0, width, height );

	const max = scaleMax( series );
	const ticks = scaleTicks( max );
	const plotLeft = 32;
	const plotRight = width - 4;
	const plotTop = 8;
	const plotBottom = height - 8;
	const plotWidth = Math.max( 1, plotRight - plotLeft );
	const plotHeight = Math.max( 1, plotBottom - plotTop );
	const yFor = ( value ) => plotBottom - ( Math.max( 0, Math.min( value, max ) ) / max ) * plotHeight;
	const grid = cssColor( '--dui-color-border', '#3a4150' );
	const label = cssColor( '--dui-color-text-muted', '#9aa4b3' );
	const baseline = cssColor( '--dui-color-accent', '#39b54a' );
	const font = cssColor( '--dui-font-mono', 'ui-monospace, Menlo, Consolas, monospace' );

	ctx.font = `500 10px ${ font }`;
	ctx.textAlign = 'right';
	ctx.lineWidth = 1;

	for ( const tick of ticks ) {

		const y = yFor( tick );
		const mark = tick === 60;
		ctx.strokeStyle = mark ? baseline : grid;
		ctx.setLineDash( mark ? [ 3, 3 ] : [] );
		ctx.beginPath();
		ctx.moveTo( plotLeft, y );
		ctx.lineTo( plotRight, y );
		ctx.stroke();
		ctx.setLineDash( [] );
		ctx.fillStyle = mark ? baseline : label;
		ctx.textBaseline = tick === ticks[ 0 ] ? 'bottom' : tick === ticks[ ticks.length - 1 ] ? 'top' : 'middle';
		ctx.fillText( String( tick ), plotLeft - 6, y );

	}

	if ( ! series.length ) return;

	const step = series.length > 1 ? plotWidth / ( series.length - 1 ) : plotWidth;
	ctx.beginPath();
	ctx.strokeStyle = baseline;
	ctx.lineWidth = 1.5;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	for ( let i = 0; i < series.length; i += 1 ) {

		const x = plotLeft + i * step;
		const y = yFor( series[ i ] );
		if ( i === 0 ) ctx.moveTo( x, y );
		else ctx.lineTo( x, y );

	}

	ctx.stroke();

}

class ProfilerHudUI {

	static id = 'profiling';

	constructor( { context } ) {

		this.context = context;
		this.metrics = new ViewerMetrics().start();
		this.visible = false;
		this.refreshTimer = 0;
		this.panel = null;
		this.footer = null;
		this.footerFps = null;
		this.footerMs = null;
		this.renderFooter = null;
		this.graphCanvas = null;
		this.gauge = null;
		this.gaugeCanvas = null;
		this.headerValues = {};
		this.placed = false;

		if ( ! context.profiling ) context.profiling = {};
		context.profiling.profilerPanel = this;
		context.profiling.metrics = this.metrics;

		this.buildFooter();
		this.buildWindow();
		this.startRefresh();

	}

	buildFooter() {

		const host = document.getElementById( FOOTER_ID );
		if ( ! host ) return;

		this.footerFps = new Text( '— fps' ).addClass( 'ProfilerFooter-fps' );
		this.footerMs = new Text( '' ).addClass( 'ProfilerFooter-ms' );
		this.footer = row( this.footerFps, this.footerMs )
			.addClass( 'ProfilerFooter-readout' )
			.setTooltip( 'Open profiler' );
		this.footer.dom.setAttribute( 'role', 'button' );
		this.footer.dom.tabIndex = 0;
		this.footer.onClick( () => this.toggle() );
		this.footer.dom.addEventListener( 'keydown', ( event ) => {

			if ( event.key !== 'Enter' && event.key !== ' ' ) return;
			event.preventDefault();
			this.toggle();

		} );
		host.appendChild( this.footer.dom );
		this.renderFooter = new RenderFooter( host );

	}

	buildWindow() {

		this.panel = new FloatingWindow( {
			title: 'Profiler',
			icon: 'speed',
			closable: true,
		} );
		this.panel.addClass( 'ProfilerWindow' );
		this.panel.setStyles( {
			width: 'min(360px, calc(100% - 28px))',
			height: 'auto',
			maxHeight: 'min(78vh, calc(100% - 28px))',
			zIndex: '24',
		} );
		this.panel.onClose( () => {

			this.visible = false;
			this.syncRibbon();

		} );

		this.headerValues.viewer = new Text( '—' ).addClass( 'ProfilerGauge-statValue' );
		this.headerValues.client = new Text( '—' ).addClass( 'ProfilerGauge-statValue' );
		this.headerValues.frame = new Text( '—' ).addClass( 'ProfilerGauge-statValue' );
		const header = row(
			column( new Caption( 'Viewer' ), this.headerValues.viewer ).addClass( 'ProfilerGauge-stat' ),
			column( new Caption( 'Client' ), this.headerValues.client ).addClass( 'ProfilerGauge-stat' ),
			column( new Caption( 'Frame' ), this.headerValues.frame ).addClass( 'ProfilerGauge-stat' ),
		).addClass( 'ProfilerGauge-header' );

		this.gaugeCanvas = new Canvas();
		this.gaugeCanvas.dom.setAttribute( 'aria-label', 'FPS gauge' );
		this.gaugeCanvas.dom.classList.add( 'ProfilerGauge-canvas' );
		this.gauge = new FpsGauge( this.gaugeCanvas.dom );
		const gaugeCard = new Card().padding( '0.5rem 0.25rem 0.25rem' ).addClass( 'ProfilerGauge' );
		gaugeCard.add( column( header, this.gaugeCanvas ).gap( '0.25rem' ) );


		const graphCard = new Card().padding( '0.375rem' );
		this.graphCanvas = new Canvas();
		this.graphCanvas.dom.setAttribute( 'aria-label', 'FPS history' );
		this.graphCanvas.dom.classList.add( 'ProfilerGraph' );
		graphCard.add( this.graphCanvas );

		this.panel.setContent( column( gaugeCard, graphCard ) );
		this.panel.hide();

	}

	mountWindow() {

		const mount = this.context.viewport ?? document.body;
		this.panel.mountFloating( mount );
		const host = mount.getBoundingClientRect();
		this.panel.dom.style.width = `${ Math.min( 360, Math.max( 240, host.width - 28 ) ) }px`;
		this.panel.dom.style.height = 'auto';
		if ( this.placed ) return;

		const box = this.panel.dom.getBoundingClientRect();
		const left = Math.max( 8, host.width - box.width - 14 );
		const top = 14;
		this.panel.dom.style.left = `${ left }px`;
		this.panel.dom.style.top = `${ top }px`;
		this.panel.dom.style.right = '';
		this.panel.dom.style.bottom = '';
		this.placed = true;

	}

	toggle() {

		return this.visible ? this.hide() : this.show();

	}

	show() {

		this.mountWindow();
		this.visible = true;
		this.syncRibbon();
		this.refresh();
		return this;

	}

	hide() {

		this.visible = false;
		this.panel?.hide();
		this.syncRibbon();
		return this;

	}

	syncRibbon() {

		document.getElementById( RIBBON_BUTTON_ID )?.classList.toggle( 'Active', this.visible );
		this.footer?.toggleClass( 'is-open', this.visible );

	}

	startRefresh() {

		const tick = () => {

			this.refresh();
			this.refreshTimer = window.setTimeout( tick, 250 );

		};

		tick();

	}


	refresh() {

		const snapshot = this.metrics.readViewer( Viewer.get() );
		const fps = snapshot.wasmFps > 0 ? snapshot.wasmFps : snapshot.clientFps;
		const tone = fpsTone( fps );

		this.footerFps?.setValue( formatFps( fps ) );
		this.footerMs?.setValue( snapshot.frameMs > 0 ? formatMs( snapshot.frameMs ) : '' );
		this.footerFps?.removeClass( 'is-good' ).removeClass( 'is-ok' ).removeClass( 'is-low' );
		if ( tone ) this.footerFps?.addClass( tone );
		this.renderFooter?.update( snapshot );

		if ( ! this.visible ) return;

		this.headerValues.viewer?.setValue( formatFps( snapshot.wasmFps ) );
		this.headerValues.client?.setValue( formatFps( snapshot.clientFps ) );
		this.headerValues.frame?.setValue( formatMs( snapshot.frameMs ) );
		this.gauge?.update( fps );
		if ( this.graphCanvas ) drawSparkline( this.graphCanvas.dom, this.metrics.getFpsHistory() );

	}

	destroy() {

		if ( this.refreshTimer ) {

			clearTimeout( this.refreshTimer );
			this.refreshTimer = 0;

		}

		this.metrics.stop();
		this.gauge?.destroy();
		this.gauge = null;
		this.panel?.hide();
		this.renderFooter?.destroy();
		this.footer?.dom.remove();
		this.panel = null;
		this.footer = null;
		this.renderFooter = null;

	}

}

export default [ ProfilerHudUI ];
