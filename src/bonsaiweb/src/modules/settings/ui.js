import {
	Caption,
	Checkbox,
	FloatingDialog,
	InputColor,
	InputDropdown,
	InputNumber,
	StackPanel,
	TabView,
	Text,
	Tooltip,
} from '@aeco-dev/gui';

import ops from '../../ops.js';
import { Loader } from '../../tool/index.js';
import { store } from '../../context/store.js';
import { Viewer } from '../../tool/Viewer.js';

const RIBBON_BUTTON_ID = 'RB_Settings';
const DEFAULT_BACKGROUND = '#202329';

const KERNELS = {
	passthrough: 'Passthrough',
	opencascade: 'OpenCascade',
	manifold: 'Manifold',
	cgal: 'CGAL',
	cgalsimple: 'CGAL simple',
	'hybrid-manifold-opencascade': 'Hybrid (Manifold + OpenCascade)',
};

const THREADS = {
	auto: 'Auto (worker)',
	worker: 'Worker',
	main: 'Main thread',
};

const DELIVERY = {
	stream: 'Stream while converting',
	end: 'Open when finished',
};

const FOG_MODES = {
	linear: 'Linear',
	exp2: 'Exponential',
};

function column( ...children ) {

	return new StackPanel( { isVertical: true } ).gap( '0.625rem' ).add( ...children );

}

function row( ...children ) {

	return new StackPanel( { isVertical: false } )
		.gap( '0.5rem' )
		.setStyle( 'alignItems', [ 'center' ] )
		.setStyle( 'flexWrap', [ 'wrap' ] )
		.add( ...children );

}

function hint( control, text ) {

	new Tooltip( text ).attachTo( control );
	return control;

}

function labeled( label, control, tip ) {

	const caption = new Text( label );
	caption.setStyle( 'fontSize', [ '0.7rem' ] );
	if ( tip ) hint( control, tip );
	return new StackPanel( { isVertical: true } )
		.gap( '0.15rem' )
		.setStyle( 'flex', [ '1' ] )
		.setStyle( 'minWidth', [ '6rem' ] )
		.add( caption, control );

}

function heading( label ) {

	return new Text( label ).setStyle( 'fontWeight', [ '600' ] );

}

function note( text ) {

	return new Caption( text ).setStyle( 'whiteSpace', [ 'pre-wrap' ] );

}

function dropdown( options, tip ) {

	const input = hint( new InputDropdown(), tip );
	input.setOptions( options );
	input.setStyle( 'width', [ '100%' ] );
	return input;

}

function numberInput( value, precision, step, min, max ) {

	const input = new InputNumber( value ).setPrecision( precision ).setStep( step ).setNudge( step );
	input.setRange( min, max );
	input.setValue( value );
	input.setStyle( 'width', [ '100%' ] );
	return input;

}

function fogModeName( mode ) {

	return mode === 2 || mode === 'exp2' ? 'exp2' : 'linear';

}


class SettingsPanelUI {

	static id = 'settings';

	constructor( { context } ) {

		this.context = context;
		this._writing = false;
		this._background = DEFAULT_BACKGROUND;

		this._kernel = dropdown( KERNELS, 'IfcOpenShell geometry plugin.' );
		this._thread = dropdown( THREADS, 'Auto converts in a worker. Main thread blocks frames while it tessellates.' );
		this._delivery = dropdown(
			DELIVERY,
			'Stream shows meshes as they are tessellated. Open when finished waits for the sidecar, then loads it in one step.',
		);
		this._geometryNote = note( '' );

		this._color = hint( new InputColor(), 'Viewport clear colour. Fog fades toward this colour.' );
		this._color.setValue( DEFAULT_BACKGROUND );
		this._color.setStyle( 'width', [ '100%' ] );

		this._fogEnabled = new Checkbox( true );
		this._fogEnabled.dom.setAttribute( 'aria-label', 'Fog' );
		this._fogMode = dropdown( FOG_MODES, 'Linear uses near and far. Exponential uses density.' );
		this._fogNear = numberInput( 0.35, 2, 0.05, 0, 20 );
		this._fogFar = numberInput( 2.2, 2, 0.05, 0, 50 );
		this._fogDensity = numberInput( 0.002, 3, 0.001, 0, 1 );

		this._kernel.onChange( () => this._commitGeometry( { kernel: this._kernel.getValue() } ) );
		this._thread.onChange( () => this._commitGeometry( { thread: this._thread.getValue() } ) );
		this._delivery.onChange( () => this._commitGeometry( { delivery: this._delivery.getValue() } ) );

		this._color.dom.addEventListener( 'input', () => this._onBackground() );
		this._color.onChange( () => this._onBackground() );
		this._fogEnabled.onChange( () => this._commitFog( { enabled: this._fogEnabled.getValue() } ) );
		this._fogMode.onChange( () => this._commitFog( { mode: this._fogMode.getValue() } ) );
		for ( const [ input, key ] of [
			[ this._fogNear, 'near' ],
			[ this._fogFar, 'far' ],
			[ this._fogDensity, 'density' ],
		] ) {

			const apply = () => {

				const n = Number( String( input.dom.value ).trim() );
				if ( ! Number.isFinite( n ) ) return;
				this._commitFog( { [ key ]: n } );

			};

			input.dom.addEventListener( 'input', apply );
			input.onChange( apply );

		}

		const tabs = new TabView();
		tabs.addTab( 'settings-geometry', 'Geometry', column(
			labeled( 'Kernel', this._kernel ),
			labeled( 'Thread', this._thread ),
			labeled( 'Delivery', this._delivery ),
			this._geometryNote,
		).padding( '0.75rem 0.15rem 0.15rem' ) );
		tabs.addTab( 'settings-scene', 'Scene', column(
			heading( 'Background' ),
			labeled( 'Colour', this._color ),
			heading( 'Fog' ),
			row( this._fogEnabled, new Text( 'Enabled' ) ),
			labeled( 'Mode', this._fogMode ),
			row(
				labeled( 'Near', this._fogNear, 'Where linear fog starts, as a multiple of the camera distance.' ),
				labeled( 'Far', this._fogFar, 'Where linear fog is fully opaque, as a multiple of the camera distance.' ),
			),
			labeled( 'Density', this._fogDensity, 'Strength of exponential fog.' ),
			note( 'Linear fog uses near and far. Exponential fog uses density. Fog fades into the background colour.' ),
		).padding( '0.75rem 0.15rem 0.15rem' ) );
		tabs.select( 'settings-geometry' );

		this.dialog = new FloatingDialog( {
			title: 'Settings',
			icon: 'settings',
			panelStyles: { width: 'min(24rem, calc(100% - 1rem))' },
		} );
		this.dialog.addClass( 'SettingsDialog' );
		this.dialog.content( tabs );
		this.dialog.onShow = () => {

			this.syncRibbon();
			this.refresh();

		};

		this.dialog.onHide = () => this.syncRibbon();

		context.settings = context.settings || {};
		context.settings.panel = this;

		const { signals } = context;
		signals.viewerReady.add( () => this._syncScene() );
		signals.geometryChanged.add( ( options ) => this._paintGeometry( options ) );
		signals.backgroundChanged.add( ( payload ) => {

			if ( payload?.color ) this._paintBackground( payload.color );

		} );
		signals.fogChanged.add( () => this._syncFog() );

		this._paintGeometry( Loader.convertOptions() );

	}

	toggle() {

		this.dialog.toggle();
		return this;

	}

	isVisible() {

		return Boolean( this.dialog?.isActive );

	}

	syncRibbon() {

		document.getElementById( RIBBON_BUTTON_ID )?.classList.toggle( 'Active', this.isVisible() );

	}

	refresh() {

		this._paintGeometry( Loader.convertOptions() );
		this._syncScene();

	}

	_commitGeometry( patch ) {

		ops.Settings.SetGeometry( patch );

	}

	_paintGeometry( options ) {

		if ( ! options ) return;
		if ( ! this._kernel.dom.matches( ':focus' ) ) this._kernel.setValue( options.kernel );
		if ( ! this._thread.dom.matches( ':focus' ) ) this._thread.setValue( options.thread );
		if ( ! this._delivery.dom.matches( ':focus' ) ) this._delivery.setValue( options.delivery );
		const streamNote = Loader.canStream()
			? 'Stream feeds parts into the viewer as tessellation proceeds.'
			: 'This viewer build has no stream API, so Stream still opens the sidecar when conversion finishes.';
		this._geometryNote.setValue(
			'Auto and Worker convert in a worker at every file size. Main thread is opt-in and yields every 30 ms. '
			+ `Open when finished loads the sidecar in one step. ${ streamNote } `
			+ 'These apply the next time a model is converted.',
		);

	}

	_onBackground() {

		const color = this._color.getValue();
		if ( ! color || color === this._background ) return;
		this._background = color;
		if ( ! Viewer.get() ) return;
		this._writing = true;
		ops.Scene.SetBackground( color );
		this._writing = false;

	}

	_paintBackground( color ) {

		if ( this._writing || this._color.dom.matches( ':focus' ) ) return;
		if ( typeof color !== 'string' ) return;
		const hex = color.startsWith( '#' ) ? color.slice( 0, 7 ) : color;
		if ( ! /^#[0-9a-fA-F]{6}$/.test( hex ) ) return;
		this._background = hex;
		this._color.setValue( hex );

	}

	_commitFog( patch ) {

		if ( ! Viewer.get() ) return;
		this._writing = true;
		ops.Scene.SetFog( patch );
		this._writing = false;
		this._paintFogFields();

	}

	_syncScene() {

		this._paintBackground( this._background );
		this._syncFog();

	}

	_syncFog() {

		const fog = store.scene.fog;
		if ( ! fog || this._writing ) {

			this._paintFogFields();
			return;

		}

		if ( ! this._fogEnabled.dom.matches( ':focus' ) ) this._fogEnabled.setValue( fog.enabled );
		if ( ! this._fogMode.dom.matches( ':focus' ) ) this._fogMode.setValue( fogModeName( fog.mode ) );
		if ( ! this._fogNear.dom.matches( ':focus' ) ) this._fogNear.setValue( fog.near );
		if ( ! this._fogFar.dom.matches( ':focus' ) ) this._fogFar.setValue( fog.far );
		if ( ! this._fogDensity.dom.matches( ':focus' ) ) this._fogDensity.setValue( fog.density );
		this._paintFogFields();

	}

	_paintFogFields() {

		const exponential = this._fogMode.getValue() === 'exp2';
		const enabled = this._fogEnabled.getValue();
		this._fogMode.setDisabled( ! enabled );
		this._fogNear.setDisabled( ! enabled || exponential );
		this._fogFar.setDisabled( ! enabled || exponential );
		this._fogDensity.setDisabled( ! enabled || ! exponential );

	}

}

export default [ SettingsPanelUI ];
