import { Operator } from '../../ops/Operator.js';
import { Element, Ifc, Pset } from '../../tool/index.js';

function rowsFromSet( sets ) {

	const result = [];
	for ( const [ title, properties ] of Object.entries( sets ) ) {

		const rows = [];
		for ( const [ key, value ] of Object.entries( properties ) ) {

			if ( key === 'id' ) continue;
			rows.push( { key, value } );

		}

		if ( rows.length ) result.push( { title, rows } );

	}

	return result;

}

class PropertiesForPick extends Operator {

	static operatorName = 'properties.for_pick';
	static operatorLabel = 'Properties for Selection';

	constructor( context, pick ) {

		super( context );
		this.pick = pick;

	}

	execute() {

		const state = {
			entity: { entity_class: 'No item selected', predefined_type: '' },
			attributes: [],
			relationships: [],
			property_sets: [],
			quantity_sets: [],
		};

		const selection = Ifc.entity( this.pick );
		if ( ! this.pick?.objectId ) return { status: 'FINISHED', result: state };

		if ( selection ) {

			state.entity.entity_class = selection.isA();
			const predefinedType = Element.getPredefinedType( selection );
			if ( predefinedType ) state.entity.predefined_type = predefinedType;

			for ( const [ name, value ] of Element.getAttributes( selection ) ) {

				state.attributes.push( { key: name, value } );

			}

			const type = Element.getType( selection );
			if ( type ) state.relationships.push( { key: 'Type', value: Element.displayName( type ) } );

			const container = Element.getContainer( selection );
			if ( container ) state.relationships.push( { key: 'Container', value: Element.displayName( container ) } );

			state.property_sets = rowsFromSet( Pset.getPsets( selection, { psetsOnly: true } ) );
			state.quantity_sets = rowsFromSet( Pset.getPsets( selection, { qtosOnly: true } ) );

		} else {

			if ( this.pick.type ) state.entity.entity_class = this.pick.type;
			state.entity.predefined_type = 'N/A';
			if ( this.pick.name ) state.attributes.push( { key: 'Name', value: this.pick.name } );

		}

		const guid = Ifc.globalId( this.pick );
		if ( guid && ! state.attributes.some( ( row ) => row.key === 'GlobalId' ) ) {

			state.attributes.unshift( { key: 'GlobalId', value: guid } );

		}

		return { status: 'FINISHED', result: state };

	}

}

export { PropertiesForPick };
export default [ PropertiesForPick ];
