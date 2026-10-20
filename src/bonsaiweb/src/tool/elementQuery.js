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

function forwardAttr( entity, name ) {

	try {

		if ( typeof entity.getArgumentByName === 'function' ) {

			const value = entity.getArgumentByName( name );
			return value === undefined ? undefined : value;

		}

		const value = entity[ name ];
		return value === undefined ? undefined : value;

	} catch {

		return undefined;

	}

}

function inverseAttr( entity, name ) {

	try {

		if ( typeof entity.inverse === 'function' ) return entity.inverse( name );
		return entity[ name ];

	} catch {

		return undefined;

	}

}

const collator = new Intl.Collator( undefined, { numeric: true, sensitivity: 'base' } );

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

// Inverse names the panel already speaks in. Anything else is spaced from
// the EXPRESS name (IsDecomposedBy → "Is Decomposed By").
const RELATION_LABELS = {
	IsDecomposedBy: 'Aggregates',
	Decomposes: 'Decomposes',
	ContainsElements: 'Contains',
	ContainedInStructure: 'Container',
	IsTypedBy: 'Type',
	Types: 'Types',
	IsNestedBy: 'Nests',
	Nests: 'Nests',
	Declares: 'Declares',
	IsDeclaredBy: 'Declared by',
	HasAssociations: 'Associates',
	HasAssignments: 'Assigned to',
	HasOpenings: 'Voids',
	HasFillings: 'Fills',
	FillsVoids: 'Fills',
	VoidsElements: 'Voids',
	ConnectedTo: 'Connected to',
	ConnectedFrom: 'Connected from',
};

// Used when the runtime entity does not list its inverse names.
const RELATION_INVERSES = Object.keys( RELATION_LABELS );

function relationLabel( name ) {

	if ( RELATION_LABELS[ name ] ) return RELATION_LABELS[ name ];
	return name.replace( /([a-z0-9])([A-Z])/g, '$1 $2' );

}

function inverseNames( element ) {

	try {

		const names = element.inverseAttributes?.();
		if ( Array.isArray( names ) && names.length ) return names;

	} catch { /* schema inverses are not exposed on this build */ }

	return RELATION_INVERSES;

}

function attributeNames( entity ) {

	try {

		const names = entity.attributes?.();
		if ( Array.isArray( names ) && names.length ) return names;

	} catch { /* fall through */ }

	return [];

}

// The other end of one relationship: every referenced entity except this
// element, its owner history, and nested relationships.
function relationshipTargets( rel, element ) {

	const id = element.id();
	const targets = [];
	for ( const name of attributeNames( rel ) ) {

		if ( name === 'OwnerHistory' ) continue;
		for ( const target of entities( safeAttr( rel, name ) ) ) {

			if ( target.id() === id ) continue;
			if ( target.isA( 'IfcOwnerHistory' ) || target.isA( 'IfcRelationship' ) ) continue;
			targets.push( target );

		}

	}

	return targets;

}

function relationshipDisplayName( entity ) {

	const name = safeAttr( entity, 'Name' );
	if ( typeof name === 'string' && name.trim() ) return name.trim();
	try {

		return entity.isA();

	} catch {

		return 'Unnamed';

	}

}

// Direct relationship targets. Property and quantity sets stay in their own
// sections, so IsDefinedBy is not repeated here. One hop: a project lists
// its sites, not every wall under them.
export function getRelationships( element ) {

	const rows = [];
	const seen = new Set();
	for ( const name of inverseNames( element ) ) {

		if ( name === 'IsDefinedBy' ) continue;
		for ( const rel of entities( safeAttr( element, name ) ) ) {

			if ( ! rel.isA( 'IfcRelationship' ) ) continue;
			if ( rel.isA( 'IfcRelDefinesByProperties' ) ) continue;
			for ( const target of relationshipTargets( rel, element ) ) {

				const key = `${ name }:${ target.id() }`;
				if ( seen.has( key ) ) continue;
				seen.add( key );
				rows.push( { key: relationLabel( name ), value: relationshipDisplayName( target ) } );

			}

		}

	}

	return rows;

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

function entities( value ) {

	if ( isEntity( value ) ) return [ value ];
	return Array.isArray( value ) ? value.filter( isEntity ) : [];

}

// bonsai.tool.Root.get_spatial_element_class
export function isSpatialElement( entity ) {

	return entity.isA( schemaOf( entity ) === 'IFC2X3' ? 'IfcSpatialStructureElement' : 'IfcSpatialElement' );

}

export function getParts( element ) {

	const isIfc2x3 = schemaOf( element ) === 'IFC2X3';
	const parts = [];
	for ( const rel of entities( inverseAttr( element, 'IsDecomposedBy' ) ) ) {

		if ( ! isIfc2x3 || rel.isA( 'IfcRelAggregates' ) ) parts.push( ...entities( forwardAttr( rel, 'RelatedObjects' ) ) );

	}

	return parts;

}

export function getContained( element ) {

	const contained = [];
	for ( const rel of entities( inverseAttr( element, 'ContainsElements' ) ) ) {

		contained.push( ...entities( forwardAttr( rel, 'RelatedElements' ) ) );

	}

	return contained;

}

const DECOMPOSITION_RELATIONSHIPS = [
	[ 'ContainsElements', 'RelatedElements' ],
	[ 'IsDecomposedBy', 'RelatedObjects' ],
	[ 'HasOpenings', 'RelatedOpeningElement' ],
	[ 'HasFillings', 'RelatedBuildingElement' ],
	[ 'IsNestedBy', 'RelatedObjects' ],
	[ 'HasSurfaceFeatures', 'RelatedSurfaceFeatures' ],
];

export function getDecomposition( element, options = {} ) {

	const isRecursive = options.isRecursive ?? true;
	const results = new Map();
	const queue = [ element ];
	while ( queue.length > 0 ) {

		const current = queue.pop();
		for ( const [ inverse, attribute ] of DECOMPOSITION_RELATIONSHIPS ) {

			for ( const rel of entities( inverseAttr( current, inverse ) ) ) {

				for ( const related of entities( forwardAttr( rel, attribute ) ) ) {

					if ( results.has( related.id() ) ) continue;
					results.set( related.id(), related );
					queue.push( related );

				}

			}

		}

		if ( ! isRecursive ) break;

	}

	return [ ...results.values() ];

}

function coordinates( entity, attribute, fallback ) {

	const point = safeAttr( entity, attribute );
	const values = isEntity( point )
		? safeAttr( point, 'Coordinates' ) ?? safeAttr( point, 'DirectionRatios' )
		: null;
	return Array.isArray( values ) ? [ 0, 1, 2 ].map( ( i ) => values[ i ] ?? 0 ) : fallback;

}

function normalize( v ) {

	const length = Math.hypot( ...v ) || 1;
	return v.map( ( c ) => c / length );

}

// Rows of the affine [x y z | origin] matrix, as ifcopenshell.util.placement.a2p.
function axisPlacementMatrix( placement ) {

	const o = coordinates( placement, 'Location', [ 0, 0, 0 ] );
	const z = normalize( coordinates( placement, 'Axis', [ 0, 0, 1 ] ) );
	const ref = coordinates( placement, 'RefDirection', [ 1, 0, 0 ] );
	const dot = ref[ 0 ] * z[ 0 ] + ref[ 1 ] * z[ 1 ] + ref[ 2 ] * z[ 2 ];
	const x = normalize( ref.map( ( c, i ) => c - dot * z[ i ] ) );
	const y = [ z[ 1 ] * x[ 2 ] - z[ 2 ] * x[ 1 ], z[ 2 ] * x[ 0 ] - z[ 0 ] * x[ 2 ], z[ 0 ] * x[ 1 ] - z[ 1 ] * x[ 0 ] ];
	return [ 0, 1, 2 ].map( ( i ) => [ x[ i ], y[ i ], z[ i ], o[ i ] ] );

}

function multiply( a, b ) {

	return a.map( ( row ) => [ 0, 1, 2, 3 ].map( ( j ) =>
		row[ 0 ] * b[ 0 ][ j ] + row[ 1 ] * b[ 1 ][ j ] + row[ 2 ] * b[ 2 ][ j ] + ( j === 3 ? row[ 3 ] : 0 ),
	) );

}

// Local placements only; other placement kinds return null.
function getPlacement( objectPlacement ) {

	if ( ! isEntity( objectPlacement ) || ! objectPlacement.isA( 'IfcLocalPlacement' ) ) return null;
	const local = axisPlacementMatrix( safeAttr( objectPlacement, 'RelativePlacement' ) );
	const relativeTo = safeAttr( objectPlacement, 'PlacementRelTo' );
	if ( ! isEntity( relativeTo ) ) return local;
	const parent = getPlacement( relativeTo );
	return parent ? multiply( parent, local ) : null;

}

// ifcopenshell.util.placement.get_storey_elevation
export function getStoreyElevation( element ) {

	const placement = getPlacement( safeAttr( element, 'ObjectPlacement' ) );
	if ( placement ) return placement[ 2 ][ 3 ];
	const elevation = safeAttr( element, 'Elevation' );
	return typeof elevation === 'number' ? elevation : 0;

}

function nameOf( entity ) {

	const name = forwardAttr( entity, 'Name' );
	return typeof name === 'string' && name.trim() ? name.trim() : 'Unnamed';

}

function naturalCompare( a, b ) {

	return collator.compare( a, b );

}

function treeNode( entity, isContainer, children ) {

	const guid = forwardAttr( entity, 'GlobalId' );
	return {
		id: entity.id(),
		type: entity.isA(),
		name: nameOf( entity ),
		guid: typeof guid === 'string' ? guid : '',
		isContainer,
		children,
	};

}

// bonsai.tool.Spatial.load_contained_elements_by_decomposition: sorted by
// class/name, and feature elements (openings) are not listed as children.
function elementNodes( elements ) {

	return elements
		.map( ( element ) => ( { element, key: `${ element.isA() }/${ nameOf( element ) }` } ) )
		.sort( ( a, b ) => naturalCompare( a.key, b.key ) )
		.map( ( { element } ) => treeNode( element, false, elementNodes(
			getDecomposition( element, { isRecursive: false } ).filter( ( child ) => ! child.isA( 'IfcFeatureElement' ) ),
		) ) );

}

// bonsai.tool.Spatial.import_spatial_element: spatial parts of a container,
// ordered by elevation then name, followed by its decomposed elements.
function containerNode( container ) {

	const containers = getParts( container )
		.filter( isSpatialElement )
		.map( ( part ) => ( { part, elevation: getStoreyElevation( part ), name: nameOf( part ) } ) )
		.sort( ( a, b ) => ( a.elevation - b.elevation ) || naturalCompare( a.name, b.name ) )
		.map( ( { part } ) => containerNode( part ) );
	const node = treeNode( container, true, containers );
	node._lazySource = container;
	return node;

}

export function ensureElementChildren( node ) {

	if ( ! node?._lazySource ) return node?.children ?? [];
	const source = node._lazySource;
	node._lazySource = null;
	const elements = elementNodes(
		getDecomposition( source, { isRecursive: false } ).filter( ( child ) => ! isSpatialElement( child ) ),
	);
	node.children = [ ...( node.children ?? [] ), ...elements ];
	return node.children;

}

export function loadLazySpatialTree( node ) {

	ensureElementChildren( node );
	for ( const child of node.children ?? [] ) loadLazySpatialTree( child );
	return node;

}

export function getSpatialDecomposition( file ) {

	const [ project ] = file?.byType?.( 'IfcProject' ) ?? [];
	return project ? [ containerNode( project ) ] : [];

}
