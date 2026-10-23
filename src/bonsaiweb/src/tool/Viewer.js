import { viewerScripts } from '../../app/configuration/imports.js';
import { Signals } from '../context/signals.js';

// Must match IFCVIEW_VERSION. IfcViewer.create refuses to start without it.
const SIDECAR_FORMAT_VERSION = 19;
const NAV_PRESET = 'blender';

let viewer = null;
let overlays = [];
let unbindOriginReadout = null;

function appendScript( src ) {

	return new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = src;
		script.onload = () => resolve();
		script.onerror = () => reject( new Error( `Failed to load ${ src }` ) );
		document.head.appendChild( script );

	} );

}

function overlay( container, id ) {

	const el = document.createElement( 'div' );
	el.id = id;
	container.appendChild( el );
	overlays.push( el );
	return el;

}

// The tool flags the ribbon shows. Published from the frame callback, so a
// change made by a key press inside the wasm reaches the UI as well.
export function readControls( api ) {

	return {
		section: api.sectionActive(),
		fly: api.flyActive(),
		ortho: api.projectionIsOrtho(),
		grid: api.gridVisible(),
		axes: api.originAxesVisible(),
		fog: api.fogVisible(),
		xray: api.xrayActive(),
		outline: api.selectionOutlineEnabled(),
	};

}

// Called once, by Bonsai.start(). The viewer is only reachable through
// Viewer.get() once it is ready.
export async function createViewer( container, paths ) {

	if ( viewer ) throw new Error( 'bonsai: the viewer is already created' );

	const canvas = document.createElement( 'canvas' );
	// Wasm looks this id up itself (surface, input, per-frame CSS size).
	// It does not read the canvas object passed into IfcViewer.create.
	canvas.id = 'viewer-canvas';
	// The drawing buffer is owned by the viewer: each frame raf_tick reads
	// this element's CSS box (emscripten_get_element_css_size) and, when it
	// changes, reconfigures the WebGPU surface, which writes canvas.width
	// and canvas.height. Setting those here locks the layout size to the
	// bitmap, so later container changes never show up in that CSS read.
	if ( getComputedStyle( container ).position === 'static' ) {

		container.style.position = 'relative';

	}

	canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;outline:none;';
	container.appendChild( canvas );

	// Wasm draws the box-select rubber-band by id, in canvas-relative CSS px.
	// The viewport is the offset parent, and the canvas is inset to it, so
	// absolute left/top land on the canvas. pointer-events stay off so the
	// drag keeps reaching the canvas.
	overlay( container, 'marquee' );

	if ( typeof globalThis.createIfcViewer !== 'function' || ! globalThis.IfcViewer ) {

		for ( const src of viewerScripts( paths ) ) await appendScript( src );

	}

	let x, y, controls = '';
	const api = await globalThis.IfcViewer.create( {
		canvas,
		sidecarFormatVersion: SIDECAR_FORMAT_VERSION,
		navPreset: NAV_PRESET,
		moduleFactory: globalThis.createIfcViewer,
		// The viewer redraws after a resize itself. A window move can also
		// discard the bitmap, and the browser fires no event for it, so poll
		// the window position. Do not watch canvas.width/height here: that
		// would draw every resize twice.
		onFrame( frameApi ) {

			if ( frameApi.isLive() ) {

				const state = readControls( frameApi );
				const key = JSON.stringify( state );
				if ( key !== controls ) {

					controls = key;
					Signals.viewerToolsChanged.dispatch( state );

				}

			}

			if ( x === screenX && y === screenY ) return;
			x = screenX; y = screenY;
			frameApi.requestRedraw();

		},
	} );

	// The survey marker is drawn with the origin axes, and both start hidden.
	// Same call the scripting page makes once the GPU app is live.
	await api.ready;
	api.setOriginAxes( { size: 1000, visible: true } );
	const readout = overlay( container, 'origin-readout' );
	readout.hidden = true;
	unbindOriginReadout = api.bindOriginReadout( readout );
	api.canvas ??= canvas;
	api.requestRedraw();
	viewer = api;
	Signals.navPresetChanged.dispatch( { preset: NAV_PRESET } );
	return viewer;

}

// IfcViewer has no teardown method. This removes the overlays createViewer
// added; the host removes the canvas.
export function destroyViewer() {

	unbindOriginReadout?.();
	unbindOriginReadout = null;
	for ( const el of overlays ) el.remove();
	overlays = [];
	viewer = null;

}

// bonsai.tool.Viewer — the one IfcViewer of the session.
export class Viewer {

	// The raw IfcViewer api, or null until Bonsai.start() has finished
	// creating it.
	static get() {

		return viewer;

	}

}
