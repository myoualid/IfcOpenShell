import { assets } from '../assets.js';
import { Signals } from '../context/signals.js';
import { sidecarFromIfcMeshes } from '../pipeline/ifcview/index.js';
import { resolvePick } from './measure.js';

// Must match IFCVIEW_VERSION. IfcViewer.create refuses to start without it.
const SIDECAR_FORMAT_VERSION = 19;
const NAV_PRESET = 'blender';

let viewer = null;
let overlays = [];
let unbindOriginReadout = null;

// A source that was just added streams in after addFile returns. Waits for
// its modelLoaded, so its objects are in getObjects() once this resolves.
function sourceLoaded( sourceId, timeoutMs = 10000 ) {

	return new Promise( ( resolve ) => {

		const done = () => {

			clearTimeout( timer );
			Signals.modelLoaded.remove( onLoaded );
			resolve();

		};

		const onLoaded = ( payload ) => {

			if ( payload?.sourceId === sourceId ) done();

		};

		const timer = setTimeout( done, timeoutMs );
		Signals.modelLoaded.add( onLoaded );

	} );

}

function appendScript( src ) {

	return new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = src;
		script.onload = () => resolve();
		script.onerror = () => reject( new Error( `Failed to load ${ src }` ) );
		document.head.appendChild( script );

	} );

}

function overlay( viewport, id ) {

	const el = document.createElement( 'div' );
	el.id = id;
	viewport.appendChild( el );
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
export async function createViewer( viewport ) {

	if ( viewer ) throw new Error( 'bonsai: the viewer is already created' );

	const canvas = document.createElement( 'canvas' );
	// Wasm looks this id up itself (surface, input, per-frame CSS size).
	// It does not read the canvas object passed into IfcViewer.create.
	canvas.id = 'viewer-canvas';
	// The drawing buffer is owned by the viewer: each frame raf_tick reads
	// this element's CSS box (emscripten_get_element_css_size) and, when it
	// changes, reconfigures the WebGPU surface, which writes canvas.width
	// and canvas.height. Setting those here locks the layout size to the
	// bitmap, so later viewport changes never show up in that CSS read.
	canvas.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;outline:none;';
	viewport.appendChild( canvas );

	// Wasm draws the box-select rubber-band by id, in canvas-relative CSS px.
	// The viewport is the offset parent, and the canvas is inset to it, so
	// absolute left/top land on the canvas. pointer-events stay off so the
	// drag keeps reaching the canvas.
	overlay( viewport, 'marquee' );

	if ( typeof globalThis.createIfcViewer !== 'function' || ! globalThis.IfcViewer ) {

		for ( const src of assets.viewerScripts ) await appendScript( src );

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
	const readout = overlay( viewport, 'origin-readout' );
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

	// Add meshes made outside an IFC file as a new viewer source, and return
	// its source id once it has loaded. Each mesh has the ifcopenshell geom
	// shape: { id, vertices, normals, faces, colors, materialIds, transform }
	// (transform is 16 numbers, column-major). `metadata` maps a mesh id to
	// { guid, name, type } for the element table. The source is not added to
	// store.models: it has no IFC file behind it.
	static async addMeshes( meshes, { name = 'meshes', metadata = new Map() } = {} ) {

		const bytes = await sidecarFromIfcMeshes( meshes, metadata );
		const file = new File( [ bytes ], `${ name.replace( /\.ifcview$/i, '' ) }.ifcview` );
		const sourceId = await viewer.addFile( file, { name } );
		await sourceLoaded( sourceId );
		viewer.requestRedraw();
		return sourceId;

	}

	// IfcViewer cannot drop one model from the scene. This hides the
	// source's objects and frees its GPU buffers, so it is no longer drawn.
	static async removeSource( sourceId ) {

		const ids = ( await viewer.getObjects() )
			.filter( ( object ) => object.sourceId === sourceId && object.objectId > 0 )
			.map( ( object ) => object.objectId );
		if ( ids.length ) viewer.hide( ids );
		viewer.unloadModel( sourceId );
		viewer.requestRedraw();

	}

	// The world point under canvas-relative CSS px (x, y): a surface hit when
	// the viewer build has one, otherwise the horizontal plane through
	// `anchor` (or the camera target). Resolves { point, normal, placement }
	// or null.
	static pickPoint( x, y, anchor = null ) {

		return resolvePick( viewer, { x, y }, anchor ? [ anchor ] : [] );

	}

}
