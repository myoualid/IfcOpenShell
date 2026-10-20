// Length, area, and volume measurement for the web viewer.
//
// The desktop viewer measures off a mesh pick and a GPU overlay. This
// build's scripting API (ifcviewer.js) exposes the camera, selection, and
// projectWorld, not vertices. A surface pick is used when the loaded
// viewer has one (pickSurface / pickWorld). Otherwise the click hits the
// horizontal plane through the last point, or through the camera target
// for the first point. Readouts follow ifcviewer's LengthMeasurement.

const MODES = Object.freeze( [ 'length', 'area', 'volume' ] );

function sub( a, b ) {

	return [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];

}

function add( a, b ) {

	return [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ], a[ 2 ] + b[ 2 ] ];

}

function scale( a, s ) {

	return [ a[ 0 ] * s, a[ 1 ] * s, a[ 2 ] * s ];

}

function dot( a, b ) {

	return a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];

}

function hypot3( a ) {

	return Math.hypot( a[ 0 ], a[ 1 ], a[ 2 ] );

}

function normalize( a ) {

	const length = hypot3( a ) || 1;
	return [ a[ 0 ] / length, a[ 1 ] / length, a[ 2 ] / length ];

}

export function dist3( a, b ) {

	return Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] );

}

export function triArea3( a, b, c ) {

	const ba = sub( b, a );
	const ca = sub( c, a );
	const nx = ba[ 1 ] * ca[ 2 ] - ba[ 2 ] * ca[ 1 ];
	const ny = ba[ 2 ] * ca[ 0 ] - ba[ 0 ] * ca[ 2 ];
	const nz = ba[ 0 ] * ca[ 1 ] - ba[ 1 ] * ca[ 0 ];
	return 0.5 * Math.hypot( nx, ny, nz );

}

function jacobiEigen3( m00, m01, m02, m11, m12, m22 ) {

	const a = [
		[ m00, m01, m02 ],
		[ m01, m11, m12 ],
		[ m02, m12, m22 ],
	];
	const v = [
		[ 1, 0, 0 ],
		[ 0, 1, 0 ],
		[ 0, 0, 1 ],
	];
	for ( let iter = 0; iter < 50; iter ++ ) {

		let p = 0;
		let q = 1;
		let off = Math.abs( a[ 0 ][ 1 ] );
		if ( Math.abs( a[ 0 ][ 2 ] ) > off ) {

			p = 0; q = 2; off = Math.abs( a[ 0 ][ 2 ] );

		}
		if ( Math.abs( a[ 1 ][ 2 ] ) > off ) {

			p = 1; q = 2; off = Math.abs( a[ 1 ][ 2 ] );

		}
		if ( off < 1e-12 ) break;
		const app = a[ p ][ p ];
		const aqq = a[ q ][ q ];
		const apq = a[ p ][ q ];
		const theta = ( aqq - app ) / ( 2 * apq );
		const t = theta >= 0
			? 1 / ( theta + Math.sqrt( 1 + theta * theta ) )
			: 1 / ( theta - Math.sqrt( 1 + theta * theta ) );
		const c = 1 / Math.sqrt( 1 + t * t );
		const s = t * c;
		a[ p ][ p ] = app - t * apq;
		a[ q ][ q ] = aqq + t * apq;
		a[ p ][ q ] = 0;
		a[ q ][ p ] = 0;
		for ( let k = 0; k < 3; k ++ ) {

			if ( k === p || k === q ) continue;
			const akp = a[ k ][ p ];
			const akq = a[ k ][ q ];
			a[ k ][ p ] = a[ p ][ k ] = c * akp - s * akq;
			a[ k ][ q ] = a[ q ][ k ] = s * akp + c * akq;

		}
		for ( let k = 0; k < 3; k ++ ) {

			const vkp = v[ k ][ p ];
			const vkq = v[ k ][ q ];
			v[ k ][ p ] = c * vkp - s * vkq;
			v[ k ][ q ] = s * vkp + c * vkq;

		}

	}
	return {
		values: [ a[ 0 ][ 0 ], a[ 1 ][ 1 ], a[ 2 ][ 2 ] ],
		vectors: v,
	};

}

// Best-fit-plane shoelace when the points are near-planar, otherwise a
// fan from the first point. Same split as LengthMeasurement::polygonArea.
export function polygonArea( points ) {

	const n = points.length;
	if ( n < 3 ) return { area: 0, method: 'empty' };
	const centroid = [ 0, 0, 0 ];
	const min = [ Infinity, Infinity, Infinity ];
	const max = [ - Infinity, - Infinity, - Infinity ];
	for ( const p of points ) {

		centroid[ 0 ] += p[ 0 ]; centroid[ 1 ] += p[ 1 ]; centroid[ 2 ] += p[ 2 ];
		for ( let i = 0; i < 3; i ++ ) {

			min[ i ] = Math.min( min[ i ], p[ i ] );
			max[ i ] = Math.max( max[ i ], p[ i ] );

		}

	}
	centroid[ 0 ] /= n; centroid[ 1 ] /= n; centroid[ 2 ] /= n;
	const diag = Math.hypot( max[ 0 ] - min[ 0 ], max[ 1 ] - min[ 1 ], max[ 2 ] - min[ 2 ] );
	let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
	for ( const p of points ) {

		const dx = p[ 0 ] - centroid[ 0 ];
		const dy = p[ 1 ] - centroid[ 1 ];
		const dz = p[ 2 ] - centroid[ 2 ];
		c00 += dx * dx; c01 += dx * dy; c02 += dx * dz;
		c11 += dy * dy; c12 += dy * dz; c22 += dz * dz;

	}
	const eigen = jacobiEigen3( c00, c01, c02, c11, c12, c22 );
	let axis = 0;
	if ( eigen.values[ 1 ] < eigen.values[ axis ] ) axis = 1;
	if ( eigen.values[ 2 ] < eigen.values[ axis ] ) axis = 2;
	const normal = [ eigen.vectors[ 0 ][ axis ], eigen.vectors[ 1 ][ axis ], eigen.vectors[ 2 ][ axis ] ];
	let sq = 0;
	for ( const p of points ) {

		const d = ( p[ 0 ] - centroid[ 0 ] ) * normal[ 0 ]
			+ ( p[ 1 ] - centroid[ 1 ] ) * normal[ 1 ]
			+ ( p[ 2 ] - centroid[ 2 ] ) * normal[ 2 ];
		sq += d * d;

	}
	const rms = Math.sqrt( sq / n );
	const planar = diag > 0 && ( rms / diag ) < 1e-3;
	if ( ! planar ) {

		let area = 0;
		for ( let i = 1; i + 1 < n; i ++ ) area += triArea3( points[ 0 ], points[ i ], points[ i + 1 ] );
		return { area, method: 'fan' };

	}
	let u = [ normal[ 1 ] * 0 - normal[ 2 ] * 0, normal[ 2 ] * 1 - normal[ 0 ] * 0, normal[ 0 ] * 0 - normal[ 1 ] * 1 ];
	if ( dot( u, u ) < 1e-6 ) {

		u = [ normal[ 1 ] * 0 - normal[ 2 ] * 1, normal[ 2 ] * 0 - normal[ 0 ] * 0, normal[ 0 ] * 1 - normal[ 1 ] * 0 ];

	}
	u = normalize( u );
	const v = [
		normal[ 1 ] * u[ 2 ] - normal[ 2 ] * u[ 1 ],
		normal[ 2 ] * u[ 0 ] - normal[ 0 ] * u[ 2 ],
		normal[ 0 ] * u[ 1 ] - normal[ 1 ] * u[ 0 ],
	];
	const uv = points.map( ( p ) => {

		const d = sub( p, centroid );
		return [ dot( d, u ), dot( d, v ) ];

	} );
	let shoelace = 0;
	for ( let i = 0; i < n; i ++ ) {

		const a = uv[ i ];
		const b = uv[ ( i + 1 ) % n ];
		shoelace += a[ 0 ] * b[ 1 ] - b[ 0 ] * a[ 1 ];

	}
	return { area: 0.5 * Math.abs( shoelace ), method: 'planar' };

}

function angleAt( a, b, c ) {

	const ba = sub( a, b );
	const bc = sub( c, b );
	const la = hypot3( ba );
	const lc = hypot3( bc );
	if ( la === 0 || lc === 0 ) return 0;
	const cos = Math.min( 1, Math.max( - 1, dot( ba, bc ) / ( la * lc ) ) );
	return Math.acos( cos ) * 180 / Math.PI;

}

function metres( value, digits = 4 ) {

	return `${ value.toFixed( digits ) } m`;

}

function segment( a, b, label, color = '#f7fafc', dashed = false ) {

	return { a: a.slice(), b: b.slice(), label, color, dashed };

}

function chain( points, close ) {

	const segments = [];
	for ( let i = 0; i + 1 < points.length; i ++ ) {

		segments.push( segment( points[ i ], points[ i + 1 ], `${ dist3( points[ i ], points[ i + 1 ] ).toFixed( 3 ) } m` ) );

	}
	if ( close && points.length > 2 ) {

		const a = points[ points.length - 1 ];
		const b = points[ 0 ];
		segments.push( segment( a, b, `${ dist3( a, b ).toFixed( 3 ) } m` ) );

	}
	return segments;

}

function lengthReadout( points, normals ) {

	const n = points.length;
	if ( n === 0 ) return { lines: [ 'Length: click the first point' ], segments: [] };
	if ( n === 1 ) return { lines: [ '1 point — click another' ], segments: [] };
	if ( n === 2 ) {

		const a = points[ 0 ];
		const b = points[ 1 ];
		const dx = Math.abs( b[ 0 ] - a[ 0 ] );
		const dy = Math.abs( b[ 1 ] - a[ 1 ] );
		const dz = Math.abs( b[ 2 ] - a[ 2 ] );
		const segments = [
			segment( a, b, `${ dist3( a, b ).toFixed( 3 ) } m` ),
		];
		const kx = [ b[ 0 ], a[ 1 ], a[ 2 ] ];
		const ky = [ b[ 0 ], b[ 1 ], a[ 2 ] ];
		if ( dx > 1e-6 ) segments.push( segment( a, kx, `ΔX ${ dx.toFixed( 3 ) } m`, '#fc8181' ) );
		if ( dy > 1e-6 ) segments.push( segment( kx, ky, `ΔY ${ dy.toFixed( 3 ) } m`, '#68d391' ) );
		if ( dz > 1e-6 ) segments.push( segment( ky, b, `ΔZ ${ dz.toFixed( 3 ) } m`, '#63b3ed' ) );
		const na = normals[ 0 ];
		const nb = normals[ 1 ];
		if ( na && nb && Math.abs( dot( na, nb ) ) > 0.95 ) {

			const sign = dot( na, nb ) >= 0 ? 1 : - 1;
			const avg = normalize( [
				0.5 * ( na[ 0 ] + sign * nb[ 0 ] ),
				0.5 * ( na[ 1 ] + sign * nb[ 1 ] ),
				0.5 * ( na[ 2 ] + sign * nb[ 2 ] ),
			] );
			const perp = dot( sub( b, a ), avg );
			const abs = Math.abs( perp );
			const redundant = Math.abs( abs - dx ) < 1e-3 || Math.abs( abs - dy ) < 1e-3 || Math.abs( abs - dz ) < 1e-3;
			if ( abs > 1e-6 && ! redundant ) {

				segments.push( segment( a, add( a, scale( avg, perp ) ), `perp ${ abs.toFixed( 3 ) } m`, '#f7fafc', true ) );

			}

		}
		return {
			lines: [
				`Length: ${ metres( dist3( a, b ) ) }`,
				`ΔX: ${ dx.toFixed( 4 ) }  ΔY: ${ dy.toFixed( 4 ) }  ΔZ: ${ dz.toFixed( 4 ) } m`,
			],
			segments,
		};

	}
	if ( n === 3 ) {

		const [ a, b, c ] = points;
		return {
			lines: [
				`Angle at point 2: ${ angleAt( a, b, c ).toFixed( 2 ) }°`,
				`Triangle area: ${ triArea3( a, b, c ).toFixed( 4 ) } m²`,
				`Perimeter: ${ metres( dist3( a, b ) + dist3( b, c ) + dist3( c, a ) ) }`,
			],
			segments: chain( points, false ),
		};

	}
	const poly = polygonArea( points );
	let perimeter = 0;
	for ( let i = 0; i < n; i ++ ) perimeter += dist3( points[ i ], points[ ( i + 1 ) % n ] );
	return {
		lines: [
			`Polygon (${ n } points, ${ poly.method })`,
			`Area: ${ poly.area.toFixed( 4 ) } m²`,
			`Perimeter: ${ metres( perimeter ) }`,
		],
		segments: chain( points, true ),
	};

}

function areaReadout( points, patches ) {

	if ( patches.length > 0 ) {

		const total = patches.reduce( ( sum, patch ) => sum + patch.area, 0 );
		return {
			lines: [ `Area: ${ total.toFixed( 4 ) } m²  (${ patches.length } ${ patches.length === 1 ? 'patch' : 'patches' })` ],
			segments: [],
		};

	}
	if ( points.length < 3 ) {

		return {
			lines: [ points.length === 0 ? 'Area: click points around a region' : 'Area: click a third point' ],
			segments: chain( points, false ),
		};

	}
	const poly = polygonArea( points );
	let perimeter = 0;
	for ( let i = 0; i < points.length; i ++ ) perimeter += dist3( points[ i ], points[ ( i + 1 ) % points.length ] );
	return {
		lines: [
			`Area: ${ poly.area.toFixed( 4 ) } m²`,
			`Perimeter: ${ metres( perimeter ) }`,
		],
		segments: chain( points, true ),
	};

}

function volumeReadout( volumes ) {

	const count = volumes?.count ?? 0;
	if ( volumes?.source === 'viewer' && Number.isFinite( volumes.total ) ) {

		return { lines: [ `Volume: ${ volumes.total.toFixed( 4 ) } m³  (${ count } ${ count === 1 ? 'object' : 'objects' })` ] };

	}
	if ( count === 0 ) return { lines: [ 'Volume: 0.0000 m³  (0 objects)' ] };
	return { lines: [ `Volume: select objects with a viewer that exports mesh volume  (${ count } selected)` ] };

}

function cameraBasis( cam ) {

	const eye = cam.eye;
	const target = cam.target;
	let fx = target[ 0 ] - eye[ 0 ];
	let fy = target[ 1 ] - eye[ 1 ];
	let fz = target[ 2 ] - eye[ 2 ];
	const fl = Math.hypot( fx, fy, fz ) || 1;
	fx /= fl; fy /= fl; fz /= fl;
	const up = Math.abs( cam.pitch ) >= 89 ? [ 0, 1, 0 ] : [ 0, 0, 1 ];
	let sx = fy * up[ 2 ] - fz * up[ 1 ];
	let sy = fz * up[ 0 ] - fx * up[ 2 ];
	let sz = fx * up[ 1 ] - fy * up[ 0 ];
	const sl = Math.hypot( sx, sy, sz ) || 1;
	sx /= sl; sy /= sl; sz /= sl;
	return {
		eye,
		forward: [ fx, fy, fz ],
		right: [ sx, sy, sz ],
		up: [
			sy * fz - sz * fy,
			sz * fx - sx * fz,
			sx * fy - sy * fx,
		],
	};

}

function canvasSize( canvas ) {

	const rect = canvas.getBoundingClientRect?.() ?? { width: canvas.clientWidth, height: canvas.clientHeight };
	return {
		width: rect.width || canvas.clientWidth || 1,
		height: rect.height || canvas.clientHeight || 1,
	};

}

// Inverse of ifcviewer.js projectWorldFromCamera. Centre pixel looks
// through the camera target.
export function cameraRay( cam, canvas, x, y ) {

	if ( ! cam?.eye || ! cam?.target || ! canvas ) return null;
	const basis = cameraBasis( cam );
	const { width, height } = canvasSize( canvas );
	const ndcX = ( x / width ) * 2 - 1;
	const ndcY = 1 - ( y / height ) * 2;
	const aspect = width / height;
	const t = Math.tan( 45 * Math.PI / 360 );
	if ( cam.ortho ) {

		const halfH = cam.distance * t;
		const halfW = halfH * aspect;
		const vx = ndcX * halfW;
		const vy = ndcY * halfH;
		return {
			origin: add( basis.eye, add( scale( basis.right, vx ), scale( basis.up, vy ) ) ),
			dir: basis.forward.slice(),
		};

	}
	const vx = ndcX * aspect * t;
	const vy = ndcY * t;
	return {
		origin: basis.eye.slice(),
		dir: normalize( add( add( scale( basis.right, vx ), scale( basis.up, vy ) ), basis.forward ) ),
	};

}

function hitPlane( ray, point, normal ) {

	const denom = dot( ray.dir, normal );
	if ( Math.abs( denom ) < 1e-8 ) return null;
	const t = dot( sub( point, ray.origin ), normal ) / denom;
	if ( t < 0 ) return null;
	return add( ray.origin, scale( ray.dir, t ) );

}

export function pickOnWorkPlane( api, x, y, anchor ) {

	const canvas = api?.canvas;
	const cam = typeof api?.getCamera === 'function' ? api.getCamera() : null;
	const ray = cameraRay( cam, canvas, x, y );
	if ( ! ray ) return null;
	const through = anchor || cam.target;
	let point = hitPlane( ray, through, [ 0, 0, 1 ] );
	let normal = [ 0, 0, 1 ];
	if ( ! point ) {

		normal = normalize( sub( cam.target, cam.eye ) );
		point = hitPlane( ray, through, normal );

	}
	if ( ! point ) return null;
	return { point, normal, placement: 'plane' };

}

function pointOf( hit ) {

	if ( ! hit ) return null;
	const raw = hit.point || hit.world || hit.worldPos || hit.position;
	if ( ! raw || raw.length < 3 ) return null;
	return [ Number( raw[ 0 ] ), Number( raw[ 1 ] ), Number( raw[ 2 ] ) ];

}

export async function resolvePick( api, click, points = [] ) {

	let hit = null;
	if ( Array.isArray( click?.point ) ) {

		hit = {
			point: click.point.slice( 0, 3 ).map( Number ),
			normal: click.normal ? click.normal.slice( 0, 3 ).map( Number ) : null,
			area: Number.isFinite( click.area ) ? click.area : undefined,
			placement: click.placement || 'surface',
		};

	} else {

		const x = click?.x;
		const y = click?.y;
		for ( const name of [ 'pickSurface', 'pickWorld' ] ) {

			if ( typeof api?.[ name ] !== 'function' ) continue;
			const picked = await api[ name ]( x, y, { alt: !! click?.alt } );
			const point = pointOf( picked );
			if ( ! point || point.some( ( value ) => Number.isNaN( value ) ) ) continue;
			const normal = picked.normal || picked.worldNormal || null;
			const area = Number.isFinite( picked.area ) ? picked.area : picked.patchArea;
			hit = {
				point,
				normal: normal ? [ normal[ 0 ], normal[ 1 ], normal[ 2 ] ] : null,
				area: Number.isFinite( area ) ? area : undefined,
				placement: 'surface',
			};
			break;

		}
		hit ??= pickOnWorkPlane( api, x, y, points[ points.length - 1 ] );

	}
	return hit;

}

export function readVolumes( api, ids ) {

	const list = ids ?? ( typeof api?.getSelection === 'function' ? api.getSelection() : [] );
	const count = list?.length ?? 0;
	if ( typeof api?.volumesPerObject === 'function' ) {

		const rows = api.volumesPerObject( list ) ?? [];
		let total = 0;
		for ( const row of rows ) total += Number( row.volume ?? row[ 1 ] ) || 0;
		return { total, count, source: 'viewer' };

	}
	if ( typeof api?.volumeOf === 'function' ) {

		return { total: Number( api.volumeOf( list ) ) || 0, count, source: 'viewer' };

	}
	return { total: null, count, source: 'none' };

}

function copyPoint( point ) {

	return point ? [ point[ 0 ], point[ 1 ], point[ 2 ] ] : null;

}

export class Measure {

	constructor() {

		this._mode = null;
		this._points = [];
		this._normals = [];
		this._patches = [];
		this._placement = null;
		this._volumes = null;

	}

	mode() {

		return this._mode;

	}

	setMode( mode ) {

		const next = MODES.includes( mode ) ? mode : null;
		if ( next === this._mode ) return this.snapshot();
		this._mode = next;
		this._points = [];
		this._normals = [];
		this._patches = [];
		this._placement = null;
		this._volumes = next === 'volume' ? { total: null, count: 0, source: 'none' } : null;
		return this.snapshot();

	}

	clear() {

		this._points = [];
		this._normals = [];
		this._patches = [];
		this._placement = null;
		return this.snapshot();

	}

	undo() {

		if ( this._patches.length > 0 ) this._patches.pop();
		else {

			this._points.pop();
			this._normals.pop();

		}
		if ( this._points.length === 0 && this._patches.length === 0 ) this._placement = null;
		return this.snapshot();

	}

	add( hit ) {

		if ( ! hit?.point || ( this._mode !== 'length' && this._mode !== 'area' ) ) return this.snapshot();
		if ( this._mode === 'area' && Number.isFinite( hit.area ) ) {

			this._patches.push( { area: hit.area, point: copyPoint( hit.point ) } );

		} else {

			this._points.push( copyPoint( hit.point ) );
			this._normals.push( hit.normal ? copyPoint( hit.normal ) : null );

		}
		if ( hit.placement ) this._placement = hit.placement;
		return this.snapshot();

	}

	syncVolume( api, ids ) {

		if ( this._mode !== 'volume' ) return this.snapshot();
		this._volumes = readVolumes( api, ids );
		return this.snapshot();

	}

	snapshot() {

		const points = this._points.map( ( point ) => point.slice() );
		let readout = { lines: [], segments: [] };
		if ( this._mode === 'length' ) readout = lengthReadout( points, this._normals );
		else if ( this._mode === 'area' ) readout = areaReadout( points, this._patches );
		else if ( this._mode === 'volume' ) readout = { ...volumeReadout( this._volumes ), segments: [] };
		const dots = this._patches.length > 0
			? this._patches.map( ( patch ) => patch.point.slice() )
			: points;
		return {
			mode: this._mode,
			points,
			dots,
			placement: this._placement,
			lines: readout.lines,
			segments: readout.segments,
			volumes: this._volumes ? { ...this._volumes } : null,
		};

	}

}

export const measure = new Measure();

export function projectPoint( api, xyz ) {

	if ( typeof api?.projectWorld === 'function' ) {

		const projected = api.projectWorld( xyz );
		if ( projected ) return projected;

	}
	const cam = typeof api?.getCamera === 'function' ? api.getCamera() : null;
	const canvas = api?.canvas;
	if ( ! cam || ! canvas ) return null;
	const basis = cameraBasis( cam );
	const { width, height } = canvasSize( canvas );
	const rel = sub( xyz, basis.eye );
	const vx = dot( basis.right, rel );
	const vy = dot( basis.up, rel );
	const vz = - dot( basis.forward, rel );
	const aspect = width / height;
	const t = Math.tan( 45 * Math.PI / 360 );
	let cx;
	let cy;
	let cw;
	if ( cam.ortho ) {

		const halfH = cam.distance * t;
		cx = vx / ( halfH * aspect );
		cy = vy / halfH;
		cw = 1;

	} else {

		cx = vx / ( aspect * t );
		cy = vy / t;
		cw = - vz;

	}
	if ( cw <= 1e-4 ) return null;
	const ndcX = cx / cw;
	const ndcY = cy / cw;
	return {
		x: ( ndcX * 0.5 + 0.5 ) * width,
		y: ( 1 - ( ndcY * 0.5 + 0.5 ) ) * height,
	};

}
