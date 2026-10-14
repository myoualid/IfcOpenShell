// Property and relationship walks against a CDN `ifcopenshell` entity.
// The published package exports `util` as color/inspect helpers only, so
// these mirror the Python `ifcopenshell.util.element` calls the panel uses.

function isEntity( value ) {

	return !! value && typeof value.isA === 'function' && typeof value.get === 'function';

}

function safeAttr( entity, name ) {

	try {

		const value = entity.get( name );
		return value === undefined ? undefined : value;

	} catch {

		return undefined;

	}

}

function schemaOf( entity ) {

	try {

		const id = entity.file()?.schemaIdentifier?.() ?? '';
		return String( id ).replace( /(_ADD|_TC)\d+.*$/, '' );

	} catch {

		return '';

	}

}

function unwrap( value ) {

	if ( ! isEntity( value ) ) return value;
	const wrapped = safeAttr( value, 'wrappedValue' );
	if ( wrapped === undefined || isEntity( wrapped ) ) return value;
	return wrapped;

}

function isPsetDefinition( definition ) {

	return definition.isA( 'IfcPropertySet' ) || definition.isA( 'IfcPreDefinedPropertySet' );

}

function isQtoDefinition( definition ) {

	return definition.isA( 'IfcElementQuantity' );

}

export function getType( element ) {

	if ( element.isA( 'IfcTypeObject' ) ) return element;
	if ( ! element.isA( 'IfcObject' ) ) return null;

	if ( schemaOf( element ) !== 'IFC2X3' ) {

		const isTypedBy = safeAttr( element, 'IsTypedBy' );
		if ( Array.isArray( isTypedBy ) && isTypedBy.length > 0 ) {

			const relatingType = safeAttr( isTypedBy[ 0 ], 'RelatingType' );
			return isEntity( relatingType ) ? relatingType : null;

		}

		return null;

	}

	const isDefinedBy = safeAttr( element, 'IsDefinedBy' );
	if ( ! Array.isArray( isDefinedBy ) ) return null;
	for ( const rel of isDefinedBy ) {

		if ( isEntity( rel ) && rel.isA( 'IfcRelDefinesByType' ) ) {

			const relatingType = safeAttr( rel, 'RelatingType' );
			if ( isEntity( relatingType ) ) return relatingType;

		}

	}

	return null;

}

export function getPredefinedType( element ) {

	const elementType = getType( element );
	if ( elementType ) {

		let pt = safeAttr( elementType, 'PredefinedType' );
		if ( ! pt || pt === 'USERDEFINED' ) {

			pt = safeAttr( elementType, 'ElementType' ) ?? safeAttr( elementType, 'ProcessType' );

		}

		if ( typeof pt === 'string' && pt && pt !== 'NOTDEFINED' ) return pt;

	}

	let pt = safeAttr( element, 'PredefinedType' );
	if ( ! pt || pt === 'USERDEFINED' ) pt = safeAttr( element, 'ObjectType' );
	return typeof pt === 'string' && pt ? pt : null;

}

function propertyValue( property ) {

	if ( property.isA( 'IfcPropertySingleValue' ) ) {

		const value = safeAttr( property, 'NominalValue' );
		return value === undefined ? undefined : unwrap( value );

	}

	if ( property.isA( 'IfcPropertyEnumeratedValue' ) ) {

		const values = safeAttr( property, 'EnumerationValues' );
		if ( Array.isArray( values ) && values.length === 1 ) return unwrap( values[ 0 ] );

	}

	if ( property.isA( 'IfcPropertyListValue' ) ) {

		const values = safeAttr( property, 'ListValues' );
		if ( Array.isArray( values ) && values.length === 1 ) return unwrap( values[ 0 ] );

	}

	return undefined;

}

const QUANTITY_ATTRS = [ 'LengthValue', 'AreaValue', 'VolumeValue', 'CountValue', 'WeightValue', 'TimeValue' ];

function quantityValue( quantity ) {

	if ( ! quantity.isA( 'IfcPhysicalSimpleQuantity' ) ) return undefined;
	for ( const name of QUANTITY_ATTRS ) {

		const value = safeAttr( quantity, name );
		if ( value !== undefined && value !== null ) return unwrap( value );

	}

	return undefined;

}

function getPropertyDefinition( definition ) {

	if ( ! definition ) return null;
	const out = {};
	if ( definition.isA( 'IfcPropertySet' ) ) {

		for ( const property of safeAttr( definition, 'HasProperties' ) ?? [] ) {

			const name = safeAttr( property, 'Name' );
			if ( typeof name !== 'string' || ! name ) continue;
			const value = propertyValue( property );
			if ( value !== undefined ) out[ name ] = value;

		}

		return out;

	}

	if ( definition.isA( 'IfcElementQuantity' ) ) {

		for ( const quantity of safeAttr( definition, 'Quantities' ) ?? [] ) {

			const name = safeAttr( quantity, 'Name' );
			if ( typeof name !== 'string' || ! name ) continue;
			const value = quantityValue( quantity );
			if ( value !== undefined ) out[ name ] = value;

		}

		return out;

	}

	return null;

}

function mergeDefinition( result, definition, psetsOnly, qtosOnly ) {

	if ( ! isEntity( definition ) ) return;
	if ( psetsOnly && ! isPsetDefinition( definition ) ) return;
	if ( qtosOnly && ! isQtoDefinition( definition ) ) return;
	const name = safeAttr( definition, 'Name' );
	if ( typeof name !== 'string' || ! name ) return;
	const values = getPropertyDefinition( definition );
	if ( ! values ) return;
	const existing = result[ name ] ?? ( result[ name ] = {} );
	Object.assign( existing, values );

}

export function getPsets( element, options = {} ) {

	const psetsOnly = options.psetsOnly ?? false;
	const qtosOnly = options.qtosOnly ?? false;
	const shouldInherit = options.shouldInherit ?? true;
	const result = {};

	if ( element.isA( 'IfcTypeObject' ) ) {

		for ( const def of safeAttr( element, 'HasPropertySets' ) ?? [] ) {

			mergeDefinition( result, def, psetsOnly, qtosOnly );

		}

		return result;

	}

	if ( ! element.isA( 'IfcObject' ) ) return result;

	if ( shouldInherit ) {

		const typeObject = getType( element );
		if ( typeObject ) {

			const inherited = getPsets( typeObject, { psetsOnly, qtosOnly, shouldInherit: false } );
			for ( const [ setName, props ] of Object.entries( inherited ) ) {

				result[ setName ] = { ...props };

			}

		}

	}

	const isDefinedBy = safeAttr( element, 'IsDefinedBy' );
	if ( Array.isArray( isDefinedBy ) ) {

		for ( const rel of isDefinedBy ) {

			if ( ! isEntity( rel ) || ! rel.isA( 'IfcRelDefinesByProperties' ) ) continue;
			mergeDefinition( result, safeAttr( rel, 'RelatingPropertyDefinition' ), psetsOnly, qtosOnly );

		}

	}

	return result;

}

export function getAggregate( element ) {

	const decomposes = safeAttr( element, 'Decomposes' );
	if ( Array.isArray( decomposes ) ) {

		for ( const rel of decomposes ) {

			if ( isEntity( rel ) && rel.isA( 'IfcRelAggregates' ) ) {

				const parent = safeAttr( rel, 'RelatingObject' );
				if ( isEntity( parent ) ) return parent;

			}

		}

	}

	return null;

}

function getParent( element ) {

	const aggregate = getAggregate( element );
	if ( aggregate ) return aggregate;
	const nests = safeAttr( element, 'Nests' );
	if ( Array.isArray( nests ) && nests.length > 0 ) {

		const rel = nests[ 0 ];
		const parent = safeAttr( rel, 'RelatingObject' );
		if ( isEntity( parent ) ) return parent;

	}

	return null;

}

export function getContainer( element, options = {} ) {

	const shouldGetDirect = options.shouldGetDirect ?? false;
	const ifcClass = options.ifcClass;

	const contained = safeAttr( element, 'ContainedInStructure' );
	if ( Array.isArray( contained ) && contained.length > 0 ) {

		const rel = contained[ 0 ];
		const relating = safeAttr( rel, 'RelatingStructure' );
		if ( ! isEntity( relating ) ) return null;
		if ( shouldGetDirect ) {

			if ( ! ifcClass || relating.isA( ifcClass ) ) return relating;
			return null;

		}

		if ( ! ifcClass ) return relating;
		let container = relating;
		while ( container ) {

			if ( container.isA( ifcClass ) ) return container;
			container = getAggregate( container );

		}

		return null;

	}

	if ( shouldGetDirect ) return null;

	const parent = getParent( element );
	if ( parent ) return getContainer( parent, { ifcClass } );
	return null;

}

const SPATIAL_STRUCTURE_TYPES = new Set( [
	'IfcProject',
	'IfcSite',
	'IfcBuilding',
	'IfcBuildingStorey',
	'IfcSpace',
	'IfcFacility',
	'IfcFacilityPart',
	'IfcBridge',
	'IfcBridgePart',
	'IfcFacilityPartCommon',
	'IfcMarineFacility',
	'IfcMarinePart',
	'IfcRailway',
	'IfcRailwayPart',
	'IfcRoad',
	'IfcRoadPart',
	'IfcExternalSpatialStructureElement',
	'IfcExternalSpatialElement',
] );

const SPATIAL_TYPE_ORDER = new Map(
	[
		'IfcProject',
		'IfcSite',
		'IfcFacility',
		'IfcBridge',
		'IfcMarineFacility',
		'IfcRailway',
		'IfcRoad',
		'IfcBuilding',
		'IfcBuildingStorey',
		'IfcSpace',
		'IfcFacilityPart',
		'IfcBridgePart',
		'IfcFacilityPartCommon',
		'IfcMarinePart',
		'IfcRailwayPart',
		'IfcRoadPart',
		'IfcExternalSpatialStructureElement',
		'IfcExternalSpatialElement',
	].map( ( typeName, index ) => [ typeName, index ] ),
);

function asString( value ) {

	return typeof value === 'string' ? value : '';

}

function isSpatialStructureType( typeName ) {

	if ( ! typeName ) return false;
	if ( SPATIAL_STRUCTURE_TYPES.has( typeName ) ) return true;
	return typeName.startsWith( 'Ifc' ) && typeName.includes( 'Spatial' );

}

function spatialLabel( entity ) {

	const name = asString( safeAttr( entity, 'Name' ) ).trim();
	return name || entity.isA() || `Entity #${ entity.id() }`;

}

function asEntityList( value ) {

	if ( ! Array.isArray( value ) ) return [];
	return value.filter( ( entry ) => entry != null && typeof entry.id === 'function' );

}

function inverseEntityList( entity, attribute ) {

	try {

		return asEntityList( entity[ attribute ] ?? safeAttr( entity, attribute ) );

	} catch {

		return [];

	}

}

function relatedFromAggregates( entity ) {

	const related = [];
	for ( const rel of inverseEntityList( entity, 'IsDecomposedBy' ) ) {

		related.push( ...asEntityList( safeAttr( rel, 'RelatedObjects' ) ) );

	}

	return related;

}

function containedProducts( entity ) {

	const related = [];
	for ( const rel of inverseEntityList( entity, 'ContainsElements' ) ) {

		related.push( ...asEntityList( safeAttr( rel, 'RelatedElements' ) ) );

	}

	return related;

}

function spatialSort( a, b ) {

	const rankA = SPATIAL_TYPE_ORDER.get( a.isA() ) ?? 999;
	const rankB = SPATIAL_TYPE_ORDER.get( b.isA() ) ?? 999;
	if ( rankA !== rankB ) return rankA - rankB;
	return spatialLabel( a ).localeCompare( spatialLabel( b ), undefined, {
		numeric: true,
		sensitivity: 'base',
	} );

}

function productSort( a, b ) {

	const typeCompare = a.isA().localeCompare( b.isA(), undefined, {
		numeric: true,
		sensitivity: 'base',
	} );
	if ( typeCompare !== 0 ) return typeCompare;
	return spatialLabel( a ).localeCompare( spatialLabel( b ), undefined, {
		numeric: true,
		sensitivity: 'base',
	} );

}

function buildSpatialNode( entity, pathVisited, isStructure ) {

	const guid = asString( safeAttr( entity, 'GlobalId' ) );
	if ( pathVisited.has( entity.id() ) ) {

		return {
			id: entity.id(),
			type: entity.isA(),
			name: spatialLabel( entity ),
			guid,
			isStructure,
			children: [],
		};

	}

	pathVisited.add( entity.id() );
	const children = [];

	if ( isStructure ) {

		for ( const child of relatedFromAggregates( entity )
			.filter( ( entry ) => isSpatialStructureType( entry.isA() ) )
			.sort( spatialSort ) ) {

			children.push( buildSpatialNode( child, pathVisited, true ) );

		}

		for ( const product of containedProducts( entity )
			.filter( ( entry ) => ! isSpatialStructureType( entry.isA() ) )
			.sort( productSort ) ) {

			children.push( buildSpatialNode( product, pathVisited, false ) );

		}

	}

	pathVisited.delete( entity.id() );

	return {
		id: entity.id(),
		type: entity.isA(),
		name: spatialLabel( entity ),
		guid,
		isStructure,
		children,
	};

}

export function getSpatialDecomposition( file ) {

	if ( ! file || typeof file.byType !== 'function' ) return [];
	return file
		.byType( 'IfcProject' )
		.sort( spatialSort )
		.map( ( project ) => buildSpatialNode( project, new Set(), true ) );

}
