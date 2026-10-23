import {
	CollapsiblePanel,
	InputSearch,
	Operator,
	PropertyGrid,
	StackPanel,
	SummaryCard,
} from '@aeco-dev/gui';

import ops from '../../ops.js';

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

/**
 * Keep a set whose name matches (all rows), or only the rows whose name or
 * value match. Returns null when nothing in the set matches.
 */
function filterSet( set, text ) {

	if ( ! text || set.title.toLowerCase().includes( text ) ) return set;
	const rows = set.rows.filter( ( row ) =>
		String( row.key ).toLowerCase().includes( text ) ||
		String( row.value ?? '' ).toLowerCase().includes( text ) );
	return rows.length ? { title: set.title, rows } : null;

}

/** A section of key/value rows. */
class GridSection {

	constructor( title, emptyText ) {

		this.grid = new PropertyGrid( { rows: {}, emptyText } );
		this.panel = new CollapsiblePanel( { title } ).add( this.grid );

	}

	setRows( rows ) {

		this.grid.setRows( rowsObject( rows ) );

	}

}

/** A section of titled sets, with a filter field toggled from its header. */
class SetSection {

	constructor( title, { emptyText, noMatchText, placeholder } ) {

		this.sets = [];
		this.emptyText = emptyText;
		this.noMatchText = noMatchText;

		this.toggle = new Operator( 'filter_alt' );
		this.toggle.dom.title = placeholder;
		this.toggle.onClick( () => this._toggleFilter() );

		this.filter = new InputSearch( placeholder, () => this._render() );
		this.filter.setHidden( true );

		this.list = new StackPanel( { isVertical: true } ).gap( '6px' );
		this.panel = new CollapsiblePanel( { title, actions: [ this.toggle ] } ).add( this.filter, this.list );

	}

	setSets( sets ) {

		this.sets = sets;
		this._render();

	}

	_toggleFilter() {

		const open = this.filter.dom.hidden;
		this.filter.setHidden( ! open );
		this.toggle.dom.classList.toggle( 'is-active', open );
		if ( open ) {

			this.panel.expand();
			this.filter.dom.focus();

		} else if ( this.filter.getValue() ) {

			this.filter.setValue( '' );
			this._render();

		}

	}

	_render() {

		const text = this.filter.getValue().trim().toLowerCase();
		const shown = this.sets.map( ( set ) => filterSet( set, text ) ).filter( Boolean );

		this.list.clear();
		if ( ! shown.length ) {

			const emptyText = this.sets.length ? this.noMatchText : this.emptyText;
			this.list.add( new PropertyGrid( { rows: {}, emptyText } ) );
			return;

		}

		for ( const set of shown ) {

			this.list.add( new PropertyGrid( { title: set.title, rows: rowsObject( set.rows ) } ) );

		}

	}

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
		this._entity = new SummaryCard( { icon: 'deployed_code' } );
		this._attributes = new GridSection( 'Attributes', 'No attributes' );
		this._relationships = new GridSection( 'Relationships', 'No relationships' );
		this._psets = new SetSection( 'Properties', {
			emptyText: 'No properties',
			noMatchText: 'No matching properties',
			placeholder: 'Filter properties or sets',
		} );
		this._qtos = new SetSection( 'Quantities', {
			emptyText: 'No quantities',
			noMatchText: 'No matching quantities',
			placeholder: 'Filter quantities or sets',
		} );

		this.root = new StackPanel( { isVertical: true } )
			.gap( '10px' )
			.add(
				this._entity,
				this._attributes.panel,
				this._psets.panel,
				this._qtos.panel,
				this._relationships.panel,
			);

		const { signals } = context;
		signals.objectPicked.add( () => this._refresh() );
		signals.modelLoaded.add( () => this._refresh( null ) );
		signals.modelCleared.add( () => this._refresh( null ) );
		this._refresh( null );

	}

	_refresh( pick ) {

		const selected = pick === undefined ? this.context.activeObject : pick;
		const { result: state } = ops.Properties.ForPick( selected );
		this._entity
			.setTitle( state.entity.entity_class || '—' )
			.setSubtitle( state.entity.predefined_type || '' );
		this._attributes.setRows( state.attributes );
		this._relationships.setRows( state.relationships );
		this._psets.setSets( state.property_sets );
		this._qtos.setSets( state.quantity_sets );

	}

}

export default [ PropertiesPanelUI ];
