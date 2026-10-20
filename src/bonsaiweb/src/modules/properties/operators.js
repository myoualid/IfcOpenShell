import { Operator } from '../../ops.js';
import { getContainer, getPredefinedType, getRelationships, getType } from '../../tool/elementQuery.js';
import { Element, Ifc, Pset } from '../../tool/index.js';
import { viewer } from '../../tool/Viewer.js';

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

function selectedElement( pick ) {

	if ( ! pick?.objectId ) return null;
	try {

		return viewer.getSelectedObjects().find( ( row ) => row.objectId === pick.objectId ) ?? null;

	} catch {

		return null;

	}

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

		if ( ! this.pick?.objectId && ! this.pick?.guid ) return { status: 'FINISHED', result: state };
		const selection = Ifc.entity( this.pick );
		const row = this.pick?.objectId ? selectedElement( this.pick ) : null;

		if ( selection ) {

			state.entity.entity_class = selection.isA();
			const predefinedType = getPredefinedType( selection );
			if ( predefinedType ) state.entity.predefined_type = predefinedType;

			for ( const [ name, value ] of Element.getAttributes( selection ) ) {

				state.attributes.push( { key: name, value } );

			}

			state.relationships = getRelationships( selection );

			const type = getType( selection );
			if ( type && ! state.relationships.some( ( row ) => row.key === 'Type' ) ) {

				state.relationships.push( { key: 'Type', value: Element.displayName( type ) } );

			}

			const container = getContainer( selection );
			const containerName = container ? Element.displayName( container ) : '';
			if ( containerName && ! state.relationships.some( ( row ) => row.key === 'Container' && row.value === containerName ) ) {

				state.relationships.push( { key: 'Container', value: containerName } );

			}

			state.property_sets = rowsFromSet( Pset.getPsets( selection, { psetsOnly: true } ) );
			state.quantity_sets = rowsFromSet( Pset.getPsets( selection, { qtosOnly: true } ) );

		} else {

			// No live IFC. The v19 element row is {objectId, guid, name, type,
			// model, sourceId}; `type` is the IFC class. A click does not
			// carry name or class — getSelectedObjects() does, once the
			// element table has been fetched.
			const ifcClass = row?.type || this.pick.type;
			const name = row?.name || this.pick.name;
			if ( ifcClass ) state.entity.entity_class = ifcClass;
			state.entity.predefined_type = 'N/A';
			if ( name ) state.attributes.push( { key: 'Name', value: name } );

		}

		const guid = Ifc.globalId( this.pick ) || row?.guid;
		if ( guid && ! state.attributes.some( ( row ) => row.key === 'GlobalId' ) ) {

			state.attributes.unshift( { key: 'GlobalId', value: guid } );

		}

		return { status: 'FINISHED', result: state };

	}

}

export { PropertiesForPick };
export default [ PropertiesForPick ];
