import {
	Caption,
	CollapsiblePanel,
	PropertyGrid,
	StackPanel,
	Title,
} from '@aeco-dev/gui';

import { PropertiesForPick } from './operators.js';

function rowsObject( rows ) {

	const out = {};
	rows.forEach( ( row, index ) => {

		out[ `row-${ index }` ] = {
			label: String( row.key ),
			value: row.value == null ? '' : String( row.value ),
		};

	} );
	return out;

}

function fillGrid( panel, rows, emptyText ) {

	panel.clear();
	if ( ! rows.length ) {

		panel.add( new Caption( emptyText ) );
		return;

	}

	panel.add( new PropertyGrid( { compact: true, rows: rowsObject( rows ) } ) );

}

function fillSets( panel, sets, emptyText ) {

	panel.clear();
	if ( ! sets.length ) {

		panel.add( new Caption( emptyText ) );
		return;

	}

	const stack = new StackPanel( { isVertical: true } ).gap( '0.75rem' );
	for ( const set of sets ) {

		stack.add( new Title( set.title ) );
		stack.add( new PropertyGrid( { compact: true, rows: rowsObject( set.rows ) } ) );

	}

	panel.add( stack );

}

class PropertiesPanelUI {

	static id = 'properties';

	static spec = {
		group: 'properties',
		position: 'right',
		id: 'properties-panel',
		label: 'Properties',
		icon: 'tune',
		title: 'Properties',
	};

	constructor( { context } ) {

		this.context = context;
		this._class = new Title( '—' );
		this._predef = new Caption( '' );
		this._attributes = new CollapsiblePanel( { title: 'Attributes' } );
		this._relationships = new CollapsiblePanel( { title: 'Relationships' } );
		this._psets = new CollapsiblePanel( { title: 'Property Sets' } );
		this._qtos = new CollapsiblePanel( { title: 'Quantities' } );

		this.root = new StackPanel( { isVertical: true } )
			.gap( '0.5rem' )
			.add(
				this._class,
				this._predef,
				this._attributes,
				this._relationships,
				this._psets,
				this._qtos,
			);

		const { signals } = context;
		signals.objectPicked.add( () => this._refresh() );
		signals.modelLoaded.add( () => this._refresh( null ) );
		signals.modelCleared.add( () => this._refresh( null ) );
		this._refresh( null );

	}

	_refresh( pick ) {

		const selected = pick === undefined ? this.context.store.selection : pick;
		const { result: state } = new PropertiesForPick( this.context, selected ).run();
		const entityClass = state.entity.entity_class || '—';
		const predefined = state.entity.predefined_type || '';
		this._class.setValue( entityClass );
		this._predef.setValue( predefined );
		this._predef.setHidden( ! predefined );
		fillGrid( this._attributes, state.attributes, 'No attributes' );
		fillGrid( this._relationships, state.relationships, 'No relationships' );
		fillSets( this._psets, state.property_sets, 'No properties' );
		fillSets( this._qtos, state.quantity_sets, 'No quantities' );

	}

}

export default [ PropertiesPanelUI ];
