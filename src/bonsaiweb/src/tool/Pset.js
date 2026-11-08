// bonsai.tool.Pset — property / quantity sets against an open
// ifcopenshell file. Delegates graph traversal to elementQuery.getPsets
// and formats scalar values for the properties panel via Element.formatScalar.

import { getPsets } from './elementQuery.js';
import { Element } from './Element.js';

function formatValues( values ) {

	const out = {};
	for ( const [ key, raw ] of Object.entries( values ) ) {

		const formatted = Element.formatScalar( raw );
		if ( formatted !== null ) out[ key ] = formatted;

	}

	return out;

}

export class Pset {

	// Walk psets/qsets on an entity, with occurrence values overriding type-
	// inherited ones. Options: { psetsOnly, qtosOnly, shouldInherit }.
	// Python: `util.element.get_psets`.
	static getPsets( entity, { psetsOnly = false, qtosOnly = false, shouldInherit = true } = {} ) {

		if ( ! entity ) return {};
		const raw = getPsets( entity, { psetsOnly, qtosOnly, shouldInherit } );
		const result = {};
		for ( const [ name, values ] of Object.entries( raw ) ) {

			result[ name ] = formatValues( values );

		}

		return result;

	}

}

export default Pset;
