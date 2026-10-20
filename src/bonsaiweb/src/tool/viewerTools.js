// The embedded viewer page calls these through the wasm module. The JS API
// wraps some of them (grid, axes, fog, x-ray) and, on newer builds, section,
// fly, and projection. Read whichever form the loaded viewer actually has.

function call( api, method, symbol ) {

	if ( api && typeof api[ method ] === 'function' ) return api[ method ]();
	const fn = api?.module?.[ symbol ];
	if ( typeof fn !== 'function' ) return undefined;
	return fn();

}

function flag( api, method, symbol ) {

	const value = call( api, method, symbol );
	if ( typeof value === 'boolean' ) return value;
	if ( typeof value === 'number' ) return value !== 0;
	return false;

}

export function readViewerTools( api ) {

	return {
		section: flag( api, 'sectionActive', '_section_is_active_c' ),
		fly: flag( api, 'flyActive', '_fly_is_active_c' ),
		ortho: flag( api, 'projectionIsOrtho', '_projection_is_ortho_c' ),
		grid: typeof api?.gridVisible === 'function' ? !! api.gridVisible() : false,
		axes: typeof api?.originAxesVisible === 'function' ? !! api.originAxesVisible() : false,
		fog: typeof api?.fogVisible === 'function' ? !! api.fogVisible() : false,
		xray: typeof api?.xrayActive === 'function' ? !! api.xrayActive() : false,
		outline: typeof api?.selectionOutlineEnabled === 'function' ? !! api.selectionOutlineEnabled() : false,
	};

}

export function toggleSection( api ) {

	call( api, 'toggleSection', '_toggle_section_c' );
	return flag( api, 'sectionActive', '_section_is_active_c' );

}

export function clearSection( api ) {

	call( api, 'clearSection', '_clear_section_c' );

}

export function toggleFly( api ) {

	call( api, 'toggleFly', '_toggle_fly_c' );
	return flag( api, 'flyActive', '_fly_is_active_c' );

}

export function toggleProjection( api ) {

	if ( typeof api?.toggleProjection === 'function' || typeof api?.module?._toggle_projection_c === 'function' ) {

		call( api, 'toggleProjection', '_toggle_projection_c' );
		return flag( api, 'projectionIsOrtho', '_projection_is_ortho_c' );

	}

	if ( typeof api?.setCamera === 'function' && typeof api?.getCamera === 'function' ) {

		const ortho = ! api.getCamera().ortho;
		api.setCamera( { ortho } );
		return ortho;

	}

	return false;

}

export function toggleGrid( api ) {

	if ( typeof api?.toggleGrid === 'function' ) api.toggleGrid();
	return typeof api?.gridVisible === 'function' ? !! api.gridVisible() : false;

}

export function toggleAxes( api ) {

	if ( typeof api?.toggleOriginAxes === 'function' ) api.toggleOriginAxes();
	return typeof api?.originAxesVisible === 'function' ? !! api.originAxesVisible() : false;

}

export function toggleFog( api ) {

	if ( typeof api?.toggleFog === 'function' ) api.toggleFog();
	return typeof api?.fogVisible === 'function' ? !! api.fogVisible() : false;

}

let last = null;
const listeners = new Set();

function same( a, b ) {

	if ( ! a || ! b ) return false;
	return a.section === b.section && a.fly === b.fly && a.ortho === b.ortho
		&& a.grid === b.grid && a.axes === b.axes && a.fog === b.fog
		&& a.xray === b.xray && a.outline === b.outline;

}

export function publishViewerTools( api ) {

	const next = readViewerTools( api );
	if ( same( last, next ) ) return last;
	last = next;
	for ( const cb of listeners ) cb( next );
	return next;

}

export function onViewerTools( cb ) {

	listeners.add( cb );
	if ( last ) cb( last );
	return () => listeners.delete( cb );

}
