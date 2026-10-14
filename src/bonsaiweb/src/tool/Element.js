// bonsai.tool.Element — scalar / display helpers against an open
// ifcopenshell file. Mirrors helpers/element.{h,cpp} in bonsaiviewer, and
// delegates graph walks (getType / getContainer / getPredefinedType /
// getSpatialDecomposition) to elementQuery for Python parity with the
// CDN entity API.

import { getContainer, getPredefinedType, getSpatialDecomposition, getType } from './elementQuery.js';

function safeGet( entity, name ) {

	try {

		const value = entity.get( name );
		return value === undefined ? null : value;

	} catch {

		return null;

	}

}

function getStringAttribute( entity, name ) {

	const value = safeGet( entity, name );
	return ( typeof value === 'string' && value.length ) ? value : null;

}

export class Element {

	// Primitive scalar formatted for a single table cell. Entity refs,
	// aggregates and IFC null become null — same as C++ `format_scalar`.
	static formatScalar( value ) {

		if ( value === null || value === undefined ) return null;
		if ( typeof value === 'string' ) return value;
		if ( typeof value === 'boolean' ) return value ? 'True' : 'False';
		if ( typeof value === 'number' ) return String( value );
		if ( typeof value === 'bigint' ) return value.toString();
		return null;

	}

	// Construction type of an occurrence. Python: `util.element.get_type`.
	static getType( entity, _file ) {

		if ( ! entity ) return null;
		return getType( entity );

	}

	// Prefer the type's PredefinedType, fall back to ElementType / ProcessType
	// when USERDEFINED, then the occurrence's own PredefinedType / ObjectType.
	// Python: `util.element.get_predefined_type`.
	static getPredefinedType( entity, _file ) {

		if ( ! entity ) return null;
		return getPredefinedType( entity );

	}

	// Spatial container, walking through aggregates. Python:
	// `util.element.get_container`.
	static getContainer( entity, _file ) {

		if ( ! entity ) return null;
		return getContainer( entity );

	}

	// Project → Site → Building → Storey → products from IFC relations.
	static getSpatialDecomposition( file ) {

		return getSpatialDecomposition( file );

	}

	// Direct EXPRESS attributes with primitive scalar values, in declaration
	// order. Entity refs, aggregates and IFC null are omitted.
	static getAttributes( entity ) {

		if ( ! entity ) return [];
		const info = entity.getInfo( { recursive: false, scalarOnly: true, includeIdentifier: false } );
		const out = [];
		for ( const [ key, value ] of Object.entries( info ) ) {

			if ( key === 'type' ) continue;
			const formatted = Element.formatScalar( value );
			if ( formatted !== null ) out.push( [ key, formatted ] );

		}

		return out;

	}

	// Display name for a relationship target: Name when present, else class.
	static displayName( entity ) {

		if ( ! entity ) return '';
		const name = getStringAttribute( entity, 'Name' );
		if ( name ) return name;
		return entity.isA();

	}

}

export default Element;
