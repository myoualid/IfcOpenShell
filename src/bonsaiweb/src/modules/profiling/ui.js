import {
	Canvas,
	Card,
	Caption,
	Code,
	FloatingWindow,
	Grid,
	PropertyGrid,
	StackPanel,
	Text,
} from '@aeco-dev/gui';

import { Viewer } from '../../tool/Viewer.js';
import { FpsGauge } from './fps-gauge.js';
import {
	ViewerMetrics,
	formatBytes,
	formatCount,
	formatFps,
	formatMs,
	formatObjects,
} from './metrics.js';

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

function metricValue( initial = '—' ) {

	return new Code( initial );

}

function statTile( label ) {

	const valueEl = new Code( '—' );
	const tile = new Card()
		.padding( '0.5rem 0.625rem' )
		.add( column( new Caption( label ), valueEl ).gap( '0.15rem' ) );
	return { tile, valueEl };

}

function fpsTone( fps ) {

	if ( ! Number.isFinite( fps ) || fps <= 0 ) return '';
	if ( fps >= 50 ) return 'is-good';
	if ( fps >= 30 ) return 'is-ok';
	return 'is-low';

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
	if ( ! series.length ) return;

	const peak = Math.max( 60, ...series, 1 );
	const step = series.length > 1 ? width / ( series.length - 1 ) : width;
	const color = getComputedStyle( document.documentElement )
		.getPropertyValue( '--dui-color-accent' )
		.trim() || '#39b54a';

	ctx.beginPath();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	for ( let i = 0; i < series.length; i += 1 ) {

		const x = i * step;
		const y = height - ( Math.min( series[ i ], peak ) / peak ) * ( height - 4 ) - 2;
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
		this.fpsStrip = {};
		this.renderValues = {};
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

		this.fpsStrip.viewer = statTile( 'Viewer FPS' );
		this.fpsStrip.client = statTile( 'Client FPS' );
		this.fpsStrip.frame = statTile( 'Frame time' );

		const tiles = new Grid().autoFit( '96px' ).gap( '0.5rem' );
		tiles.add(
			this.fpsStrip.viewer.tile,
			this.fpsStrip.client.tile,
			this.fpsStrip.frame.tile,
		);

		const graphCard = new Card().padding( '0.375rem' );
		this.graphCanvas = new Canvas();
		this.graphCanvas.dom.setAttribute( 'aria-label', 'FPS history' );
		this.graphCanvas.dom.classList.add( 'ProfilerGraph' );
		graphCard.add( this.graphCanvas );

		this.renderValues = {
			objects: metricValue(),
			triangles: metricValue(),
			drawCalls: metricValue(),
			vram: metricValue(),
			missing: metricValue(),
		};

		const renderGrid = new PropertyGrid( {
			compact: true,
			title: 'Render',
			rows: {
				objects: { label: 'Objects', value: this.renderValues.objects },
				triangles: { label: 'Triangles', value: this.renderValues.triangles },
				drawCalls: { label: 'Draw calls', value: this.renderValues.drawCalls },
				vram: { label: 'VRAM', value: this.renderValues.vram },
				missing: { label: 'Chunks missing', value: this.renderValues.missing },
			},
		} );

		this.panel.setContent( column( gaugeCard, tiles, graphCard, renderGrid ) );
		this.panel.hide();

	}

	mountWindow() {

		const mount = this.context.dom?.viewport
			|| document.getElementById( 'Viewport' )
			|| document.getElementById( 'World' )
			|| document.body;
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

		if ( ! this.visible ) return;

		this.headerValues.viewer?.setValue( formatFps( snapshot.wasmFps ) );
		this.headerValues.client?.setValue( formatFps( snapshot.clientFps ) );
		this.headerValues.frame?.setValue( formatMs( snapshot.frameMs ) );
		this.gauge?.update( fps );
		this.fpsStrip.viewer.valueEl.setTextContent( formatFps( snapshot.wasmFps ) );
		this.fpsStrip.client.valueEl.setTextContent( formatFps( snapshot.clientFps ) );
		this.fpsStrip.frame.valueEl.setTextContent( formatMs( snapshot.frameMs ) );
		this.renderValues.objects.setTextContent(
			formatObjects( snapshot.objectsVisible, snapshot.objectsTotal ),
		);
		this.renderValues.triangles.setTextContent(
			formatObjects( snapshot.trianglesVisible, snapshot.trianglesTotal ),
		);
		this.renderValues.drawCalls.setTextContent( formatCount( snapshot.drawCalls ) );
		this.renderValues.vram.setTextContent(
			snapshot.vramCapacity > 0
				? `${ formatBytes( snapshot.vramUsed ) } / ${ formatBytes( snapshot.vramCapacity ) }`
				: formatBytes( snapshot.vramUsed ),
		);
		this.renderValues.missing.setTextContent( formatCount( snapshot.workingSetMissing ) );
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
		this.footer?.dom.remove();
		this.panel = null;
		this.footer = null;

	}

}

export default [ ProfilerHudUI ];
