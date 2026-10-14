// Upstream ifcviewer is two classic scripts, not an ESM package.
// IfcViewerWeb.js publishes `globalThis.createIfcViewer`.
// ifcviewer.js publishes `globalThis.IfcViewer` and looks that factory up
// in IfcViewer.create().
import { fromRoot } from '../root.js';
import '../../vendor/@ifcopenshell/viewer/ifcviewer.js';

const VIEWER_WEB_URL = fromRoot( 'vendor/@ifcopenshell/viewer/IfcViewerWeb.js' );

export const IfcViewer = globalThis.IfcViewer;

let viewer = null;

// raf_tick draws only when this byte is set, then clears it. Input (a click)
// sets it. Moving the window or resizing the canvas throws away the bitmap
// and does not, so the view stays blank until the next click. There is no
// redraw method on the IfcViewer API — this is the flag the tick checks.
const REDRAW_FLAG = 16;

function requestFrame( module ) {

	const ptr = module?._app_ptr;
	const heap = module?.HEAPU8;
	if ( ! ptr || ! heap ) return;
	heap[ ptr + REDRAW_FLAG ] |= 1;

}

function loadFactory() {

	if ( typeof globalThis.createIfcViewer === 'function' ) {

		return Promise.resolve( globalThis.createIfcViewer );

	}

	return new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = VIEWER_WEB_URL.href;
		script.onerror = () => reject( new Error( `Failed to load ${ script.src }` ) );
		document.head.appendChild( script );

	} );

}

export async function create( container ) {

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

	const moduleFactory = await loadFactory();
	let x, y, w, h;

	viewer = await IfcViewer.create( {
		canvas,
		navPreset: 'blender',
		moduleFactory,
		// Runs after the tick. canvas.width/height change exactly when the
		// tick reconfigured the surface (bitmap cleared); a window move fires
		// no event at all. Plain property reads, no layout.
		onFrame( api ) {

			if ( x === screenX && y === screenY && w === canvas.width && h === canvas.height ) return;
			x = screenX; y = screenY; w = canvas.width; h = canvas.height;
			requestFrame( api.module );

		},
	} );

	return viewer;

}

export function destroy() {

	// IfcViewer.create() has no teardown method. The host removes the canvas.
	viewer = null;

}

export { viewer };
