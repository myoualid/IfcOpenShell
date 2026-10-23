// Signals — the session's event bus. One Signal per observable moment in
// the viewer's life: boot, model streaming, selection, display, camera,
// input mapping. UI code and addons subscribe here instead of threading
// callbacks through every module.
//
// Payload conventions:
//   - sourceId is the federation handle returned by the viewer.
//   - selectionChanged.ids are objectIds (ascending), matching
//     viewer.getSelection().
//   - objectPicked carries the viewer's single-click payload
//     {objectId, guid, modelIndex, sourceId}. Name and IFC class are not
//     on that payload; they come from viewer.getSelectedObjects() after
//     the v19 element table has loaded. The pick signal fires only after
//     that fetch, so the table is ready for listeners.
//   - *Changed signals fire after the state is applied, not before.
//
// js-signals is bundled (UMD read as CommonJS): the session is built before
// any download, so the bus cannot wait on one.

import signals from '../../node_modules/signals/dist/signals.js';
import { createLogger } from '../util/log.js';

export const { Signal } = signals;

const log = createLogger( 'bonsai' );

export const Signals = {
	// SESSION LIFECYCLE
	// The session exists before both. appReady: ifcopenshell is up too.
	appReady: new Signal(),
	viewerReady: new Signal(),

	// MODEL LIFECYCLE
	modelLoadStarted: new Signal(), // { source: 'file'|'url', name? }
	modelLoaded: new Signal(), // { sourceId }
	modelCleared: new Signal(), // ()
	modelLoadedToGPU: new Signal(), // { sourceId, ok }
	modelUnloaded: new Signal(), // { sourceId }
	modelNameChanged: new Signal(), // { sourceId, name }
	// Fires once the main-thread ifcopenshell has finished opening the
	// live IFC that pairs with a loaded sidecar — the data-side analogue
	// of modelLoaded. tool.Ifc.set attaches the live file to that model id,
	// so attribute / pset / qto lookups return something richer than the
	// sidecar's four basic fields. { sourceId, name, file }.
	liveIfcReady: new Signal(),

	// SCENE: SELECTION
	objectPicked: new Signal(), // ({objectId, guid, modelIndex, sourceId}) — name/type via getSelectedObjects
	selectionChanged: new Signal(), // ({ ids: number[] })
	selectionCleared: new Signal(), // ()

	// SCENE: VISIBILITY & DISPLAY
	visibilityChanged: new Signal(), // ({ action, target? })
	xrayToggled: new Signal(), // ({ active })
	viewerToolsChanged: new Signal(), // ({ section, fly, ortho, grid, axes, fog, xray, outline })
	measureChanged: new Signal(), // ({ mode, points, lines, segments, placement })
	colorsChanged: new Signal(), // ({ action, target?, color? })
	backgroundChanged: new Signal(), // ({ color })
	fogChanged: new Signal(), // ({ enabled, mode, near, far, density })
	geometryChanged: new Signal(), // ({ kernel, thread, delivery })

	// CAMERA
	cameraChanged: new Signal(), // (cameraState)
	standardViewSet: new Signal(), // ({ id })

	// CONTROLS
	navPresetChanged: new Signal(), // ({ preset })

	// HISTORY
	historyChanged: new Signal(), // (cmd | undefined)
};

export function addSignal( signal ) {

	if ( ! Signals[ signal ] ) {

		Signals[ signal ] = new Signal();

	}

	return Signals[ signal ];

}

export function removeSignal( signal ) {

	delete Signals[ signal ];

}

// Logs every dispatch, with fetch / convert / stream timings per model load.
export function logSignals( signals ) {

	const timing = new Map();
	const slot = ( key ) => {

		if ( ! timing.has( key ) ) timing.set( key, {} );
		return timing.get( key );

	};

	let currentKey = null;

	for ( const [ name, signal ] of Object.entries( signals ) ) {

		if ( typeof signal?.add !== 'function' ) continue;
		signal.add( ( ...args ) => {

			const p = args[ 0 ];
			if ( name === 'modelLoadStarted' && p?.phase !== undefined ) {

				const pct = Math.round( ( p.ratio ?? 0 ) * 100 );
				log.log( `convert ${ pct }% — ${ p.phase }: ${ p.message ?? '' }` );
				const s = slot( currentKey ?? 'model' );
				if ( p.phase === 'parsing' && s.convertStart === undefined ) s.convertStart = performance.now();
				if ( p.phase === 'complete' ) s.convertEnd = performance.now();
				return;

			}

			if ( name === 'modelLoadStarted' ) {

				const key = p?.name ?? p?.url ?? 'model';
				currentKey = key;
				const s = slot( key );
				if ( p?.source === 'autoload' ) s.fetchStart = performance.now();
				if ( p?.source === 'file' ) s.streamStart = performance.now();

			}

			if ( name === 'modelLoaded' ) {

				const key = currentKey ?? 'model';
				const s = slot( key ) ?? {};
				const parts = [];
				if ( s.fetchStart !== undefined && s.convertStart !== undefined ) {

					parts.push( `fetch=${ ( s.convertStart - s.fetchStart ).toFixed( 0 ) }ms` );

				}

				if ( s.convertStart !== undefined && s.convertEnd !== undefined ) {

					parts.push( `convert=${ ( s.convertEnd - s.convertStart ).toFixed( 0 ) }ms` );

				}

				if ( s.streamStart !== undefined ) {

					parts.push( `stream+firstRender=${ ( performance.now() - s.streamStart ).toFixed( 0 ) }ms` );

				}

				const base = s.fetchStart ?? s.streamStart;
				if ( base !== undefined ) parts.push( `total=${ ( performance.now() - base ).toFixed( 0 ) }ms` );
				log.log( `modelLoaded ${ key } (${ parts.join( ' ' ) || '?' })`, p );
				return;

			}

			log.log( `${ name }`, ...args );

		} );

	}

	globalThis.addEventListener?.( 'unhandledrejection', ( e ) => {

		log.error( 'unhandled rejection:', e.reason );

	} );

}
