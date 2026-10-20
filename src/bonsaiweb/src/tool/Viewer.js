import { viewerScripts } from '../../app/configuration/imports.js';

// Must match IFCVIEW_VERSION. IfcViewer.create refuses to start without it.
const SIDECAR_FORMAT_VERSION = 19;

let viewer = null;
let originReadout = null;
let marquee = null;
let unbindOriginReadout = null;

export function appendScript( src ) {

	return new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = src;
		script.onload = () => resolve();
		script.onerror = () => reject( new Error( `Failed to load ${ src }` ) );
		document.head.appendChild( script );

	} );

}

async function loadViewer( paths ) {

	if ( typeof globalThis.createIfcViewer === 'function' && globalThis.IfcViewer ) return;
	for ( const src of viewerScripts( paths ) ) await appendScript( src );

}

export async function create( container, paths ) {

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
	marquee = document.createElement( 'div' );
	marquee.id = 'marquee';
	container.appendChild( marquee );

	await loadViewer( paths );
	const { IfcViewer } = globalThis;
	const moduleFactory = globalThis.createIfcViewer;
	let x, y;

	viewer = await IfcViewer.create( {
		canvas,
		sidecarFormatVersion: SIDECAR_FORMAT_VERSION,
		navPreset: 'blender',
		moduleFactory,
		// The viewer redraws after a resize itself. A window move can also
		// discard the bitmap, and the browser fires no event for it, so poll
		// the window position. Do not watch canvas.width/height here: that
		// would draw every resize twice.
		onFrame( api ) {

			if ( x === screenX && y === screenY ) return;
			x = screenX; y = screenY;
			api.requestRedraw();

		},
	} );

	// The survey marker is drawn with the origin axes, and both start hidden.
	// Same call the scripting page makes once the GPU app is live.
	await viewer.ready;
	viewer.setOriginAxes( { size: 1000, visible: true } );
	originReadout = document.createElement( 'div' );
	originReadout.id = 'origin-readout';
	originReadout.hidden = true;
	container.appendChild( originReadout );
	unbindOriginReadout = viewer.bindOriginReadout( originReadout );
	viewer.requestRedraw();
	viewer.canvas ??= canvas;
	return viewer;

}

export function destroy() {

	// IfcViewer.create() has no teardown method. The host removes the canvas.
	unbindOriginReadout?.();
	unbindOriginReadout = null;
	originReadout?.remove();
	originReadout = null;
	marquee?.remove();
	marquee = null;
	viewer = null;

}

export class Viewer {

	static get() {

		return viewer;

	}

}

export { viewer };
