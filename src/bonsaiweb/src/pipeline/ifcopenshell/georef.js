// This file was generated with the assistance of an AI coding tool.
//
// The model's CoordinateOperation for the .ifcview sidecar, computed the same
// way as the desktop baker (computeModelGeoref in src/ifcviewer/Federation.cpp,
// get_helmert_transformation_parameters in src/helpers/geolocation.cpp and
// helmert_meters_from_parameters in src/helpers/geolocation_transform.cpp of
// the ifcviewer branch). Without it, a model georeferenced through an
// IfcMapConversion lands at its local coordinates instead of its map
// coordinates.

const SI_PREFIX = {
	EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
	DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
};

// A plain REAL attribute comes back as a number; a select of defined types
// (IfcValue, IfcMeasureValue) as an EntityInstance with a `wrappedValue`.
function num( value, fallback ) {

	if ( typeof value === 'number' ) return value;
	if ( value && typeof value.attributes === 'function' && value.attributes().includes( 'wrappedValue' ) ) {

		return num( value.get( 'wrappedValue' ), fallback );

	}

	return fallback;

}

function has( entity, attribute ) {

	return entity.attributes().includes( attribute );

}

function unitScale( unit ) {

	if ( ! unit ) return 1;
	if ( unit.isA( 'IfcSIUnit' ) ) return SI_PREFIX[ unit.get( 'Prefix' ) ] ?? 1;
	if ( unit.isA( 'IfcConversionBasedUnit' ) ) {

		const factor = unit.get( 'ConversionFactor' );
		return num( factor.get( 'ValueComponent' ), 1 ) * unitScale( factor.get( 'UnitComponent' ) );

	}

	return 1;

}

/** Metres per project length unit (calculate_unit_scale for LENGTHUNIT). */
export function projectLengthToMeters( file ) {

	const project = file.byType( 'IfcProject' )[ 0 ];
	const assignment = project?.get( 'UnitsInContext' ) ?? file.byType( 'IfcUnitAssignment' )[ 0 ];
	for ( const unit of assignment?.get( 'Units' ) ?? [] ) {

		if ( unit.isA( 'IfcNamedUnit' ) && unit.get( 'UnitType' ) === 'LENGTHUNIT' ) return unitScale( unit );

	}

	return 1;

}

function psetValues( entity, psetName ) {

	for ( const rel of entity.inverse( 'IsDefinedBy' ) ) {

		if ( ! rel.isA( 'IfcRelDefinesByProperties' ) ) continue;
		const pset = rel.get( 'RelatingPropertyDefinition' );
		if ( ! pset?.isA( 'IfcPropertySet' ) || pset.get( 'Name' ) !== psetName ) continue;
		const values = {};
		for ( const prop of pset.get( 'HasProperties' ) ?? [] ) {

			if ( prop.isA( 'IfcPropertySingleValue' ) ) values[ prop.get( 'Name' ) ] = num( prop.get( 'NominalValue' ), undefined );

		}

		return values;

	}

	return null;

}

/** Helmert parameters of the first coordinate operation, or null. */
export function helmertParameters( file ) {

	const p = { e: 0, n: 0, h: 0, xaa: 0, xao: 0, scale: 1, fx: 1, fy: 1, fz: 1 };
	if ( file.schema() === 'IFC2X3' ) {

		const project = file.byType( 'IfcProject' )[ 0 ];
		const values = project && psetValues( project, 'ePSet_MapConversion' );
		if ( ! values ) return null;
		p.e = values.Eastings ?? 0;
		p.n = values.Northings ?? 0;
		p.h = values.OrthogonalHeight ?? 0;
		p.xaa = values.XAxisAbscissa ?? 0;
		p.xao = values.XAxisOrdinate ?? 0;
		p.scale = values.Scale ?? 1;

	} else {

		const operation = file.byType( 'IfcCoordinateOperation' )[ 0 ];
		if ( ! operation ) return null;
		if ( operation.isA( 'IfcMapConversion' ) ) {

			p.e = num( operation.get( 'Eastings' ), 0 );
			p.n = num( operation.get( 'Northings' ), 0 );
			p.h = num( operation.get( 'OrthogonalHeight' ), 0 );
			p.xaa = num( operation.get( 'XAxisAbscissa' ), 0 );
			p.xao = num( operation.get( 'XAxisOrdinate' ), 0 );
			p.scale = num( operation.get( 'Scale' ), 1 );
			if ( operation.isA( 'IfcMapConversionScaled' ) ) {

				const prefix = has( operation, 'FactorX' ) ? 'Factor' : 'Scale';
				p.fx = num( operation.get( `${ prefix }X` ), 1 );
				p.fy = num( operation.get( `${ prefix }Y` ), 1 );
				p.fz = num( operation.get( `${ prefix }Z` ), 1 );

			}

		} else if ( operation.isA( 'IfcRigidOperation' ) ) {

			p.e = num( operation.get( 'FirstCoordinate' ), 0 );
			p.n = num( operation.get( 'SecondCoordinate' ), 0 );
			p.h = num( operation.get( 'Height' ), 0 );

		} else {

			return null;

		}

	}

	if ( p.scale === 0 ) p.scale = 1;
	if ( p.xaa === 0 && p.xao === 0 ) p.xaa = 1;
	return p;

}

// Row-major 4x4 helpers; the sidecar wants column-major, converted at the end.
function multiply( a, b ) {

	const out = new Array( 16 ).fill( 0 );
	for ( let r = 0; r < 4; r ++ ) for ( let c = 0; c < 4; c ++ ) for ( let k = 0; k < 4; k ++ ) out[ r * 4 + c ] += a[ r * 4 + k ] * b[ k * 4 + c ];
	return out;

}

function normalize( v ) {

	const length = Math.hypot( v[ 0 ], v[ 1 ], v[ 2 ] ) || 1;
	return [ v[ 0 ] / length, v[ 1 ] / length, v[ 2 ] / length ];

}

function cross( a, b ) {

	return [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];

}

// IfcAxis2Placement3D as a row-major matrix, translation scaled to metres.
function axis2Placement( placement, toMeters ) {

	const ratios = ( direction, fallback ) => direction ? [ ...direction.get( 'DirectionRatios' ), 0, 0 ].slice( 0, 3 ) : fallback;
	const origin = [ ...placement.get( 'Location' ).get( 'Coordinates' ), 0, 0 ].slice( 0, 3 );
	const z = normalize( has( placement, 'Axis' ) ? ratios( placement.get( 'Axis' ), [ 0, 0, 1 ] ) : [ 0, 0, 1 ] );
	const ref = has( placement, 'RefDirection' ) ? ratios( placement.get( 'RefDirection' ), [ 1, 0, 0 ] ) : [ 1, 0, 0 ];
	const dot = ref[ 0 ] * z[ 0 ] + ref[ 1 ] * z[ 1 ] + ref[ 2 ] * z[ 2 ];
	const x = normalize( [ ref[ 0 ] - dot * z[ 0 ], ref[ 1 ] - dot * z[ 1 ], ref[ 2 ] - dot * z[ 2 ] ] );
	const y = cross( z, x );
	return [
		x[ 0 ], y[ 0 ], z[ 0 ], origin[ 0 ] * toMeters,
		x[ 1 ], y[ 1 ], z[ 1 ], origin[ 1 ] * toMeters,
		x[ 2 ], y[ 2 ], z[ 2 ], origin[ 2 ] * toMeters,
		0, 0, 0, 1,
	];

}

// Inverse of a rigid transform: transpose the rotation, rotate back the translation.
function inverseRigid( m ) {

	const out = [ m[ 0 ], m[ 4 ], m[ 8 ], 0, m[ 1 ], m[ 5 ], m[ 9 ], 0, m[ 2 ], m[ 6 ], m[ 10 ], 0, 0, 0, 0, 1 ];
	for ( let r = 0; r < 3; r ++ ) out[ r * 4 + 3 ] = - ( out[ r * 4 ] * m[ 3 ] + out[ r * 4 + 1 ] * m[ 7 ] + out[ r * 4 + 2 ] * m[ 11 ] );
	return out;

}

function worldCoordinateSystem( file ) {

	let wcs = null;
	for ( const context of file.byTypeExclSubtypes( 'IfcGeometricRepresentationContext' ) ) {

		const placement = context.get( 'WorldCoordinateSystem' );
		if ( ! placement?.isA( 'IfcAxis2Placement3D' ) ) continue;
		wcs = placement;
		if ( context.get( 'ContextType' ) === 'Model' ) break;

	}

	return wcs;

}

/**
 * { coordinateOperationMeters: Float64Array(16) column-major,
 *   projectLengthToMeters, mapUnitToMeters } for builder.setGeoref, or null
 * when the model carries no coordinate operation.
 */
export function computeModelGeoref( file ) {

	const params = helmertParameters( file );
	if ( ! params ) return null;
	const projectToMeters = projectLengthToMeters( file );
	const mapUnitToMeters = projectToMeters / params.scale;

	const theta = Math.atan2( params.xao, params.xaa );
	const c = Math.cos( theta );
	const s = Math.sin( theta );
	const helmert = [
		c * params.fx, - s * params.fy, 0, params.e * mapUnitToMeters,
		s * params.fx, c * params.fy, 0, params.n * mapUnitToMeters,
		0, 0, params.fz, params.h * mapUnitToMeters,
		0, 0, 0, 1,
	];

	const wcs = worldCoordinateSystem( file );
	const rowMajor = wcs ? multiply( helmert, inverseRigid( axis2Placement( wcs, projectToMeters ) ) ) : helmert;
	const coordinateOperationMeters = new Float64Array( 16 );
	for ( let r = 0; r < 4; r ++ ) for ( let col = 0; col < 4; col ++ ) coordinateOperationMeters[ col * 4 + r ] = rowMajor[ r * 4 + col ];
	return { coordinateOperationMeters, projectLengthToMeters: projectToMeters, mapUnitToMeters };

}
