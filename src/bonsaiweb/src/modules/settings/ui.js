import {
	Caption,
	Checkbox,
	CollapsiblePanel,
	FloatingDialog,
	InputColor,
	InputDropdown,
	InputNumber,
	Kbd,
	Operator,
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

// Same keys and defaults as SNAPSHOT_SIZES and snapshotPrefs in the viewer operators.
const SNAPSHOT_SIZES = {
	viewport: 'Viewport',
	viewport2x: 'Viewport 2×',
	hd: '1920 × 1080',
	uhd: '3840 × 2160',
	uhd8k: '7680 × 4320',
};

const NAV_PRESETS = {
	blender: 'Blender',
	rhino: 'Rhino',
	revit: 'Revit',
	web: 'Web',
};

// Mouse buttons per preset, as ViewportCore::setNavPreset binds them.
// Select also takes Shift to add and Ctrl to remove.
const NAV_BINDINGS = {
	blender: { orbit: [ 'MMB' ], pan: [ 'Shift', 'MMB' ], select: 'LMB' },
	rhino: { orbit: [ 'RMB' ], pan: [ 'Shift', 'RMB' ], select: 'LMB' },
	revit: { orbit: [ 'Shift', 'MMB' ], pan: [ 'MMB' ], select: 'LMB' },
	web: { orbit: [ 'LMB' ], pan: [ 'MMB' ], select: 'RMB' },
};

// Viewport hotkeys from the viewer's onKeyDown. They do not change with the preset.
const KEYBOARD_GROUPS = [
	[ 'Camera', [
		[ 'View all', [ 'Home' ]],
		[ 'Frame selection', [ 'F' ]],
		[ 'Ortho / perspective', [ 'P' ]],
	]],
	[ 'Standard views', [
		[ 'Front / back', [ 'X' ], [ 'Shift', 'X' ]],
		[ 'Right / left', [ 'Y' ], [ 'Shift', 'Y' ]],
		[ 'Top / bottom', [ 'Z' ], [ 'Shift', 'Z' ]],
	]],
	[ 'Visibility', [
		[ 'Hide selected', [ 'H' ]],
		[ 'Isolate selected', [ 'Shift', 'H' ]],
		[ 'Show all', [ 'Alt', 'H' ]],
		[ 'X-ray', [ 'Alt', 'X' ]],
	]],
	[ 'Section', [
		[ 'Section tool', [ 'K' ]],
		[ 'Clear sections', [ 'Shift', 'K' ]],
	]],
	[ 'Fly', [
		[ 'Enter fly', [ 'Shift', 'F' ]],
		[ 'Move', [ 'W' ], [ 'A' ], [ 'S' ], [ 'D' ]],
		[ 'Down / up', [ 'Q' ], [ 'E' ]],
		[ 'Boost', [ 'Shift' ]],
		[ 'Speed', [ 'Wheel' ]],
		[ 'Exit fly', [ 'Esc' ]],
	]],
];

function mouseShortcuts( preset ) {

	const { orbit, pan, select } = NAV_BINDINGS[ preset ] ?? NAV_BINDINGS.blender;
	return [
		[ 'Orbit', [ ...orbit, 'drag' ]],
		[ 'Pan', [ ...pan, 'drag' ]],
		[ 'Zoom', [ 'Wheel' ]],
		[ 'Select', [ select ]],
		[ 'Add to selection', [ 'Shift', select ]],
		[ 'Remove from selection', [ 'Ctrl', select ]],
		[ 'Box select', [ select, 'drag' ]],
	];

}

// One action and its key combos. Combos are alternatives, keys within a
// combo are held together. Lowercase tokens ("drag") are gestures, not keys.
function shortcut( [ label, ...combos ] ) {

	const keys = document.createElement( 'span' );
	keys.className = 'SettingsShortcut-keys';
	combos.forEach( ( combo, i ) => {

		if ( i > 0 ) keys.append( '/' );
		combo.forEach( ( token, j ) => {

			if ( j > 0 ) keys.append( token === 'drag' ? ' ' : '+' );
			keys.append( token === 'drag' ? token : new Kbd( token ).dom );

		} );

	} );

	const line = row( new Text( label ) );
	line.addClass( 'SettingsShortcut' );
	line.setStyle( 'flexWrap', [ 'nowrap' ] );
	line.dom.append( keys );
	return line;

}

function shortcutList( entries ) {

	return new StackPanel( { isVertical: true } ).gap( '0.2rem' ).add( ...entries.map( shortcut ) );

}

function section( title, content, collapsed = true ) {

	return new CollapsiblePanel( { title, collapsed, className: 'SettingsSection' } ).add( content );

}

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

		this._snapshotSize = dropdown( SNAPSHOT_SIZES, 'Image size the Snapshot button renders at.' );
		this._snapshotSize.setValue( 'viewport' );
		this._snapshotTransparent = new Checkbox( false );
		this._snapshotTransparent.dom.setAttribute( 'aria-label', 'Transparent background' );
		this._snapshotSize.onChange( () => ops.Viewer.SetSnapshotSize( this._snapshotSize.getValue() ) );
		this._snapshotTransparent.onChange( () => ops.Viewer.SetSnapshotTransparent( this._snapshotTransparent.getValue() ) );

		this._navPreset = dropdown( NAV_PRESETS, 'Which mouse buttons orbit, pan and select.' );
		this._navPreset.setValue( 'blender' );
		this._navPreset.onChange( () => ops.Viewer.SetNavPreset( this._navPreset.getValue() ) );
		this._mouseShortcuts = new StackPanel( { isVertical: true } );
		this._paintNavPreset( 'blender' );

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
		tabs.addTab( 'settings-viewport', 'Viewport', column(
			heading( 'Snapshot' ),
			labeled( 'Size', this._snapshotSize ),
			row( this._snapshotTransparent, new Text( 'Transparent background' ) ),
			note( 'The Snapshot button in the ribbon renders the current view with these options and downloads it.' ),
		).padding( '0.75rem 0.15rem 0.15rem' ) );
		tabs.addTab( 'settings-controls', 'Controls', column(
			labeled( 'Preset', this._navPreset ),
			section( 'Mouse', this._mouseShortcuts, false ),
			...KEYBOARD_GROUPS.map( ( [ title, entries ] ) => section( title, shortcutList( entries ) ) ),
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
		signals.viewerReady.add( () => {

			this._syncScene();
			// The snapshot operators need a viewer, so apply picks made before it existed.
			ops.Viewer.SetSnapshotSize( this._snapshotSize.getValue() );
			ops.Viewer.SetSnapshotTransparent( this._snapshotTransparent.getValue() );

		} );
		signals.geometryChanged.add( ( options ) => this._paintGeometry( options ) );
		signals.backgroundChanged.add( ( payload ) => {

			if ( payload?.color ) this._paintBackground( payload.color );

		} );
		signals.fogChanged.add( () => this._syncFog() );
		signals.navPresetChanged.add( ( payload ) => {

			if ( payload?.preset ) this._paintNavPreset( payload.preset );

		} );

		this._paintGeometry( Loader.convertOptions() );
		mountViewportShading( context );

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

	_paintNavPreset( preset ) {

		if ( this._navPreset.getValue() !== preset ) this._navPreset.setValue( preset );
		this._mouseShortcuts.clear();
		this._mouseShortcuts.add( shortcutList( mouseShortcuts( preset ) ) );

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

const SHADING_GLYPH = {
	technical: '<svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.7" y="2.7" width="12.6" height="12.6" rx="1.15" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9 3.05v11.9M3.05 9h11.9" stroke="currentColor" stroke-width="1.2"/></svg>',
	shaded: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle class="disc" cx="9" cy="9" r="5.7"/></svg>',
	clay: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="5.7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9 9 9 3.3A5.7 5.7 0 0 1 13.05 13.05Z" fill="currentColor"/></svg>',
	shadedEdges: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="5.7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9 3.5v11M3.5 9h11" stroke="currentColor" stroke-width="1.15"/></svg>',
	xray: '<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="5.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.2 1.7"/></svg>',
};

const BAR_MODES = [
	{ id: 'technical', name: 'Technical' },
	{ id: 'shaded', name: 'Shaded' },
	{ id: 'clay', name: 'Clay' },
];

const MENU_MODES = [
	{ id: 'shadedEdges', name: 'Shaded + edges' },
	{ id: 'xray', name: 'X-ray shading' },
];

function glyph( mode ) {

	const node = document.createElement( 'span' );
	node.className = 'ViewportShading-glyph';
	node.innerHTML = SHADING_GLYPH[ mode ];
	return node;

}

function modeButton( mode ) {

	const button = new Operator( '' );
	const icon = button.dom.querySelector( '.Icon' );
	icon.classList.remove( 'material-symbols-outlined' );
	icon.replaceChildren( glyph( mode.id ) );
	button.dom.title = mode.name;
	button.dom.setAttribute( 'aria-label', mode.name );
	button.dom.setAttribute( 'role', 'button' );
	button.dom.tabIndex = 0;
	button.dom.dataset.mode = mode.id;
	const run = () => ops.Viewer.SetRenderMode( mode.id );
	button.onClick( run );
	button.dom.addEventListener( 'keydown', ( event ) => {

		if ( event.key !== 'Enter' && event.key !== ' ' && event.code !== 'Space' ) return;
		event.preventDefault();
		run();

	} );
	return button;

}

function menuMode( mode ) {

	const item = document.createElement( 'button' );
	item.type = 'button';
	item.className = 'ViewportShading-item';
	item.dataset.mode = mode.id;
	item.setAttribute( 'role', 'menuitemradio' );
	const preview = document.createElement( 'span' );
	preview.className = 'ViewportShading-preview';
	preview.append( glyph( mode.id ) );
	const label = document.createElement( 'span' );
	label.className = 'ViewportShading-label';
	label.textContent = mode.name;
	item.append( preview, label );
	item.addEventListener( 'click', () => ops.Viewer.SetRenderMode( mode.id ) );
	return item;

}

function menuCheck( label, onChange ) {

	const row = document.createElement( 'label' );
	row.className = 'ViewportShading-check';
	const input = document.createElement( 'input' );
	input.type = 'checkbox';
	input.setAttribute( 'role', 'switch' );
	const text = document.createElement( 'span' );
	text.textContent = label;
	row.append( text, input );
	input.addEventListener( 'change', () => onChange( input.checked ) );
	return { row, input };

}

function menuAction( label, icon, onClick ) {

	const item = document.createElement( 'button' );
	item.type = 'button';
	item.className = 'ViewportShading-action';
	const symbol = document.createElement( 'span' );
	symbol.className = 'material-symbols-outlined';
	symbol.textContent = icon;
	item.append( symbol, document.createTextNode( label ) );
	item.addEventListener( 'click', onClick );
	return item;

}

// Blender's viewport shading cluster: wire, solid, material, then Options.
// The three icons are the primary modes. The other display tools that used
// to sit in the View ribbon live in the menu.
function mountViewportShading( context ) {

	const viewport = context.viewport;
	if ( ! viewport || viewport.querySelector( '.ViewportShading' ) ) return;

	const root = document.createElement( 'div' );
	root.className = 'ViewportShading';
	root.setAttribute( 'role', 'toolbar' );
	root.setAttribute( 'aria-label', 'Viewport shading' );

	const buttons = BAR_MODES.map( ( mode ) => {

		const button = modeButton( mode );
		root.append( button.dom );
		return button;

	} );

	const options = document.createElement( 'button' );
	options.type = 'button';
	options.className = 'ViewportShading-options';
	options.setAttribute( 'aria-haspopup', 'menu' );
	options.setAttribute( 'aria-expanded', 'false' );
	options.setAttribute( 'aria-label', 'More display options' );
	options.title = 'More display options';
	const optionsIcon = document.createElement( 'span' );
	optionsIcon.className = 'material-symbols-outlined';
	optionsIcon.textContent = 'tune';
	options.append( optionsIcon );

	const menu = document.createElement( 'div' );
	menu.className = 'ViewportShading-menu';
	menu.hidden = true;
	menu.setAttribute( 'role', 'menu' );

	const heading = ( text ) => {

		const node = document.createElement( 'div' );
		node.className = 'ViewportShading-heading';
		node.textContent = text;
		return node;

	};

	const tiles = document.createElement( 'div' );
	tiles.className = 'ViewportShading-tiles';
	const modeItems = MENU_MODES.map( ( mode ) => {

		const item = menuMode( mode );
		tiles.append( item );
		return item;

	} );

	const xray = menuCheck( 'X-ray', () => ops.Viewer.ToggleXray() );
	const outline = menuCheck( 'Selection outline', ( on ) => ops.Viewer.ToggleSelectionOutline( on ) );
	const clear = menuAction( 'Clear colors', 'format_color_reset', () => {

		ops.Viewer.ClearColors();
		close();

	} );
	menu.append( heading( 'Style' ), tiles, heading( 'Overlays' ), xray.row, outline.row, clear );

	function close() {

		menu.hidden = true;
		options.setAttribute( 'aria-expanded', 'false' );

	}

	function open() {

		menu.hidden = false;
		options.setAttribute( 'aria-expanded', 'true' );

	}

	options.addEventListener( 'click', () => {

		if ( menu.hidden ) open();
		else close();

	} );

	for ( const item of modeItems ) item.addEventListener( 'click', close );

	root.append( options, menu );
	viewport.append( root );

	const paint = ( mode ) => {

		for ( const button of buttons ) {

			const on = button.dom.dataset.mode === mode;
			button.dom.classList.toggle( 'is-active', on );
			button.dom.setAttribute( 'aria-pressed', String( on ) );

		}

		for ( const item of modeItems ) {

			const on = item.dataset.mode === mode;
			item.classList.toggle( 'is-active', on );
			item.setAttribute( 'aria-checked', String( on ) );

		}

		const extra = modeItems.some( ( item ) => item.dataset.mode === mode );
		options.classList.toggle( 'is-active', extra );

	};

	paint( 'shaded' );
	context.signals.renderModeChanged.add( ( payload ) => {

		if ( payload?.mode ) paint( payload.mode );

	} );
	context.signals.viewerToolsChanged.add( ( state ) => {

		if ( ! state ) return;
		if ( xray.input.checked !== !! state.xray ) xray.input.checked = !! state.xray;
		if ( outline.input.checked !== !! state.outline ) outline.input.checked = !! state.outline;

	} );

	document.addEventListener( 'pointerdown', ( event ) => {

		if ( menu.hidden || root.contains( event.target ) ) return;
		close();

	} );
	document.addEventListener( 'keydown', ( event ) => {

		if ( event.key === 'Escape' && ! menu.hidden ) close();

	} );

}

export default [ SettingsPanelUI ];
