// This file was generated with the assistance of an AI coding tool.

import {
	Container,
	InputDropdown,
	InputSearch,
	StackPanel,
	SummaryCard,
	Text,
} from '@aeco-dev/gui';

import { store } from '../../context/store.js';
import ops from '../../ops.js';
import { Cost } from '../../tool/Cost.js';
import { Viewer } from '../../tool/Viewer.js';
import { element, iconButton, plural, setDropdown, showPanel, togglePanel } from '../../util/sheet.js';
import { ancestorIds, visibleRows } from '../../util/tree-rows.js';

// Large schedules open with their top two levels expanded.
const EXPAND_ALL_LIMIT = 300;

const COLUMNS = [
	{ key: 'identification', label: 'Code', className: 'is-code' },
	{ key: 'name', label: 'Description', className: 'is-name' },
	{ key: 'quantity', label: 'Qty', className: 'is-number' },
	{ key: 'unitSymbol', label: 'Unit', className: 'is-unit' },
	{ key: 'appliedValue', label: 'Rate', className: 'is-number' },
	{ key: 'totalCost', label: 'Total', className: 'is-number is-total' },
	{ key: 'share', label: 'Share', className: 'is-share' },
];

const quantityFormat = new Intl.NumberFormat( undefined, { maximumFractionDigits: 3 } );
const percentFormat = new Intl.NumberFormat( undefined, { style: 'percent', maximumFractionDigits: 1 } );

// Money in the project currency when it is an ISO 4217 code, else as a
// plain number with the code after it.
function moneyFormat( currency ) {

	try {

		if ( currency ) {

			const format = new Intl.NumberFormat( undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 } );
			return ( value ) => format.format( value );

		}

	} catch { /* not an ISO code, such as a user-defined currency */ }

	const format = new Intl.NumberFormat( undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 } );
	return currency ? ( value ) => `${ format.format( value ) } ${ currency }` : ( value ) => format.format( value );

}

function isPriced( row ) {

	return row.values.length > 0;

}

function csvCell( value ) {

	const cell = value == null ? '' : String( value );
	return /[",\n\r]/.test( cell ) ? `"${ cell.replace( /"/g, '""' ) }"` : cell;

}

function costState( context ) {

	context.cost ??= {};
	return context.cost;

}

class CostPanelUI {

	static id = 'bim.cost';

	static spec = {
		group: 'cost',
		position: 'bottom',
		id: 'cost-panel',
		label: 'Cost',
		icon: 'payments',
		title: 'Cost Schedule',
		autoShow: false,
		panelStyles: { height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column' },
	};

	constructor( { context } ) {

		this.context = context;
		this.workspacePanel = null;

		this.schedules = [];
		this.key = '';
		this.rows = [];
		this.byId = new Map();
		this.collapsed = new Set();
		this.linked = new Set();
		this.activeId = 0;
		this.filter = '';
		this.unpricedOnly = false;
		this.sort = { key: '', descending: false };
		this.grandTotal = 0;
		this.money = moneyFormat( '' );
		this._token = 0;

		this._build();
		costState( context ).panel = this;

		const { signals } = context;
		signals.liveIfcReady.add( () => this.refresh() );
		signals.modelCleared.add( () => this.refresh() );
		signals.objectPicked.add( ( pick ) => this._onPick( pick ) );
		this.refresh();

	}

	attach( workspacePanel ) {

		this.workspacePanel = workspacePanel;

	}

	toggle() {

		togglePanel( this.workspacePanel );
		return this;

	}

	show() {

		showPanel( this.workspacePanel );
		return this;

	}

	// Open a schedule at one item: expand to it, make it active, scroll to it.
	async reveal( modelId, scheduleId, itemId ) {

		this.show();
		const key = `${ modelId }:${ scheduleId }`;
		if ( key !== this.key ) {

			if ( ! this.schedules.some( ( schedule ) => this._keyOf( schedule ) === key ) ) await this.refresh();
			await this._open( key );

		}

		if ( ! this.byId.has( itemId ) ) return;
		this.filter = '';
		this._search.setValue( '' );
		this.unpricedOnly = false;
		this._unpriced.dom.classList.remove( 'is-active' );
		for ( const id of ancestorIds( this.byId, itemId ) ) this.collapsed.delete( id );
		this._setActive( itemId, { select: true } );

	}

	// UI

	_build() {

		this._schedule = new InputDropdown();
		this._schedule.dom.setAttribute( 'aria-label', 'Cost schedule' );
		this._schedule.onChange( () => this._open( this._schedule.getValue() ) );

		this._search = new InputSearch( 'Filter items', ( value ) => {

			this.filter = value.trim().toLowerCase();
			this._render();

		} );

		this._unpriced = iconButton( 'money_off', 'Unpriced items only', () => {

			this.unpricedOnly = ! this.unpricedOnly;
			this._unpriced.dom.classList.toggle( 'is-active', this.unpricedOnly );
			this._render();

		} );

		const toolbar = new StackPanel( { isVertical: false } )
			.addClass( 'bonsai-sheet-toolbar' )
			.add(
				this._schedule,
				this._search,
				iconButton( 'unfold_more', 'Expand all', () => this._expandAll() ),
				iconButton( 'unfold_less', 'Collapse all', () => this._collapseAll() ),
				this._unpriced,
				iconButton( 'center_focus_strong', 'Isolate the active item', () => this._selectActive( { isolate: true } ) ),
				iconButton( 'visibility', 'Show all objects', () => ops.Viewer.ShowAll() ),
				iconButton( 'download', 'Export the schedule as CSV', () => this._exportCsv() ),
				iconButton( 'refresh', 'Reload schedules from the model', () => this.refresh() ),
			);

		this._summary = new Text( '' ).addClass( 'bonsai-sheet-summary' );
		this._status = new Text( '' ).addClass( 'bonsai-sheet-status' );

		this._header = element( 'div', 'bonsai-sheet-row bonsai-sheet-header CostSheet-row' );
		this._header.addEventListener( 'click', ( event ) => this._onSort( event ) );
		this._body = element( 'div', 'bonsai-sheet-body' );
		this._body.tabIndex = 0;
		this._body.setAttribute( 'role', 'tree' );
		this._body.setAttribute( 'aria-label', 'Cost items' );
		this._empty = element( 'div', 'bonsai-sheet-empty' );

		this._grid = new Container().addClass( 'bonsai-sheet-grid CostSheet' );
		this._grid.dom.append( this._header, this._body, this._empty );

		this._body.addEventListener( 'click', ( event ) => this._onClick( event ) );
		this._body.addEventListener( 'dblclick', ( event ) => this._onDoubleClick( event ) );
		this._body.addEventListener( 'keydown', ( event ) => this._onKey( event ) );

		this.root = new StackPanel( { isVertical: true } )
			.addClass( 'bonsai-sheet' )
			.add(
				toolbar,
				new StackPanel( { isVertical: false } ).addClass( 'bonsai-sheet-info' ).add( this._summary, this._status ),
				this._grid,
			);

	}

	_keyOf( schedule ) {

		return `${ schedule.modelId }:${ schedule.id }`;

	}

	_parseKey( key ) {

		const [ modelId, scheduleId ] = String( key ).split( ':' ).map( Number );
		return { modelId, scheduleId };

	}

	// DATA

	async refresh() {

		const token = ++ this._token;
		let schedules = [];
		let failure = '';
		try {

			const result = await ops.Cost.Schedules();
			schedules = result?.result ?? [];

		} catch ( error ) {

			failure = error?.message || String( error );

		}

		if ( token !== this._token ) return;
		this.schedules = schedules;

		const several = new Set( schedules.map( ( schedule ) => schedule.modelId ) ).size > 1;
		setDropdown( this._schedule, schedules.map( ( schedule ) => ( {
			value: this._keyOf( schedule ),
			label: `${ schedule.name }${ schedule.predefinedType ? ` (${ schedule.predefinedType.toLowerCase() })` : '' }${ several ? ` — ${ schedule.modelName }` : '' }`,
		} ) ), this.key );

		if ( failure ) {

			this._clear( `Cost schedules could not be read: ${ failure }` );
			return;

		}

		if ( ! schedules.length ) {

			this._clear( store.models.some( ( entry ) => entry.file )
				? 'No cost schedules (IfcCostSchedule) in the open IFC files.'
				: 'Open an IFC file to review its cost schedules.' );
			return;

		}

		const keep = schedules.some( ( schedule ) => this._keyOf( schedule ) === this.key );
		await this._open( keep ? this.key : this._keyOf( schedules[ 0 ] ), { keepState: keep } );

	}

	async _open( key, { keepState = false } = {} ) {

		const token = ++ this._token;
		const { modelId, scheduleId } = this._parseKey( key );
		let rows;
		try {

			const result = await ops.Cost.Items( modelId, scheduleId );
			rows = result?.result ?? [];

		} catch ( error ) {

			if ( token === this._token ) this._clear( `Cost items could not be read: ${ error?.message || error }` );
			return;

		}

		if ( token !== this._token ) return;

		this.key = key;
		this._schedule.setValue( key );
		this.rows = rows;
		this.byId = new Map( rows.map( ( row ) => [ row.id, row ] ) );
		const schedule = this.schedules.find( ( entry ) => this._keyOf( entry ) === key );
		this.money = moneyFormat( schedule?.currency ?? '' );
		this.grandTotal = rows.filter( ( row ) => ! row.parentId ).reduce( ( sum, row ) => sum + row.totalCost, 0 );
		if ( ! keepState ) {

			this.collapsed = new Set( rows.length > EXPAND_ALL_LIMIT
				? rows.filter( ( row ) => row.hasChildren && row.depth >= 1 ).map( ( row ) => row.id )
				: [] );
			this.activeId = 0;
			this.linked.clear();
			this._status.setValue( '' );

		} else if ( ! this.byId.has( this.activeId ) ) {

			this.activeId = 0;

		}

		this._summarise( schedule );
		this._render();

	}

	_clear( message ) {

		this.key = '';
		this.rows = [];
		this.byId = new Map();
		this.activeId = 0;
		this.linked.clear();
		this.grandTotal = 0;
		this._summary.setValue( '' );
		this._status.setValue( '' );
		this._header.replaceChildren();
		this._body.replaceChildren();
		this._empty.textContent = message;
		this._empty.hidden = false;

	}

	_summarise( schedule ) {

		const leaves = this.rows.filter( ( row ) => ! row.hasChildren );
		const unpriced = leaves.filter( ( row ) => ! isPriced( row ) ).length;
		const linked = this.rows.filter( ( row ) => row.productCount > 0 ).length;
		const parts = [
			`Total ${ this.money( this.grandTotal ) }`,
			plural( this.rows.length, 'item' ),
		];
		if ( unpriced ) parts.push( `${ unpriced } unpriced` );
		parts.push( `${ linked } linked to elements` );
		if ( schedule?.predefinedType ) parts.push( schedule.predefinedType.toLowerCase() );
		this._summary.setValue( parts.join( '  ·  ' ) );

	}

	// Rows in tree order, with each item's children sorted by the chosen column.
	_ordered() {

		const { key, descending } = this.sort;
		if ( ! key ) return this.rows;

		const children = new Map();
		for ( const row of this.rows ) {

			if ( ! children.has( row.parentId ) ) children.set( row.parentId, [] );
			children.get( row.parentId ).push( row );

		}

		const value = ( row ) => ( key === 'share' ? row.totalCost : row[ key ] );
		const compare = ( a, b ) => {

			const x = value( a );
			const y = value( b );
			if ( x == null && y == null ) return 0;
			if ( x == null ) return 1;
			if ( y == null ) return - 1;
			const order = typeof x === 'number' && typeof y === 'number'
				? x - y
				: String( x ).localeCompare( String( y ), undefined, { numeric: true, sensitivity: 'base' } );
			return descending ? - order : order;

		};

		const result = [];
		const walk = ( parentId ) => {

			for ( const row of [ ...( children.get( parentId ) ?? [] ) ].sort( compare ) ) {

				result.push( row );
				walk( row.id );

			}

		};

		walk( 0 );
		return result;

	}

	// RENDER

	_render() {

		if ( ! this.key ) return;

		this._renderHeader();

		const text = this.filter;
		const tests = [];
		if ( text ) tests.push( ( row ) => row.name.toLowerCase().includes( text ) || row.identification.toLowerCase().includes( text ) );
		if ( this.unpricedOnly ) tests.push( ( row ) => ! row.hasChildren && ! isPriced( row ) );
		const match = tests.length ? ( row ) => tests.every( ( test ) => test( row ) ) : null;
		const rows = visibleRows( this._ordered(), { collapsed: this.collapsed, match } );

		this._visible = rows;
		const fragment = document.createDocumentFragment();
		for ( const row of rows ) fragment.append( this._renderRow( row, Boolean( match ) ) );
		this._body.replaceChildren( fragment );

		this._empty.hidden = rows.length > 0;
		this._empty.textContent = this.rows.length ? 'No items match.' : 'This cost schedule has no items yet.';

	}

	_renderHeader() {

		const { key, descending } = this.sort;
		this._header.replaceChildren( ...COLUMNS.map( ( column ) => {

			const cell = element( 'span', `bonsai-sheet-cell ${ column.className } is-sortable`, column.label );
			cell.dataset.sort = column.key;
			cell.title = column.key === 'identification' ? 'Sort by code (click again for model order)' : `Sort by ${ column.label.toLowerCase() }`;
			if ( key === column.key ) {

				cell.classList.add( 'is-sorted' );
				cell.append( element( 'span', 'CostSheet-arrow material-symbols-outlined', descending ? 'arrow_downward' : 'arrow_upward' ) );

			}

			return cell;

		} ) );

	}

	_renderRow( row, filtered ) {

		const node = element( 'div', 'bonsai-sheet-row CostSheet-row' );
		node.dataset.id = row.id;
		node.setAttribute( 'role', 'treeitem' );
		node.setAttribute( 'aria-level', String( row.depth + 1 ) );
		node.classList.toggle( 'is-summary', row.hasChildren );
		node.classList.toggle( 'is-active', row.id === this.activeId );
		node.classList.toggle( 'is-linked', this.linked.has( row.id ) );
		node.classList.toggle( 'is-unpriced', ! row.hasChildren && ! isPriced( row ) );
		if ( row.id === this.activeId ) node.setAttribute( 'aria-selected', 'true' );

		const name = element( 'span', 'bonsai-sheet-cell is-name' );
		name.style.setProperty( '--depth', row.depth );
		if ( row.hasChildren ) {

			const open = filtered || ! this.collapsed.has( row.id );
			const toggle = element( 'span', 'bonsai-sheet-toggle material-symbols-outlined', open ? 'expand_more' : 'chevron_right' );
			toggle.dataset.toggle = row.id;
			node.setAttribute( 'aria-expanded', String( open ) );
			name.append( toggle );

		} else {

			name.append( element( 'span', 'bonsai-sheet-toggle' ) );

		}

		name.append( element( 'span', 'bonsai-sheet-label', row.name ) );
		if ( row.productCount ) name.append( element( 'span', 'CostSheet-linked material-symbols-outlined', 'deployed_code' ) );
		if ( row.rateItem ) name.append( element( 'span', 'CostSheet-rate material-symbols-outlined', 'link' ) );

		const priced = isPriced( row );
		const rate = element( 'span', 'bonsai-sheet-cell is-number', priced ? this.money( row.appliedValue ) : '—' );
		const total = element( 'span', 'bonsai-sheet-cell is-number is-total', priced ? this.money( row.totalCost ) : '—' );
		const share = element( 'span', 'bonsai-sheet-cell is-share' );
		if ( priced && this.grandTotal > 0 ) {

			const ratio = row.totalCost / this.grandTotal;
			const bar = element( 'span', 'CostSheet-bar' );
			bar.style.width = `${ Math.max( 0, Math.min( 100, ratio * 100 ) ) }%`;
			share.append( bar, element( 'span', 'CostSheet-percent', percentFormat.format( ratio ) ) );

		}

		node.append(
			element( 'span', 'bonsai-sheet-cell is-code', row.identification ),
			name,
			element( 'span', 'bonsai-sheet-cell is-number', row.quantity == null ? '' : quantityFormat.format( row.quantity ) ),
			element( 'span', 'bonsai-sheet-cell is-unit', row.quantity == null ? '' : row.unitSymbol ),
			rate,
			total,
			share,
		);

		node.title = this._describe( row );
		return node;

	}

	_describe( row ) {

		const lines = [ [ row.identification, row.name ].filter( Boolean ).join( ' ' ) ];
		for ( const value of row.values ) {

			const label = value.name || ( value.category === '*' ? 'Sum' : value.category ) || 'Value';
			lines.push( `${ label }: ${ this.money( value.applied ) } = ${ value.formula }` );

		}

		if ( row.rateItem ) lines.push( `Rate from ${ [ row.rateItem.identification, row.rateItem.name ].filter( Boolean ).join( ' ' ) }` );
		if ( isPriced( row ) ) {

			const quantity = row.quantity ?? 1;
			const basis = row.unitBasis ? ` / ${ quantityFormat.format( row.unitBasis ) }` : '';
			lines.push( `${ quantityFormat.format( quantity ) }${ row.quantity == null ? '' : ` ${ row.unitSymbol }` } × ${ this.money( row.appliedValue ) }${ basis } = ${ this.money( row.totalCost ) }` );

		} else if ( ! row.hasChildren ) {

			lines.push( 'Unpriced: no cost value' );

		}

		lines.push( row.productCount ? plural( row.productCount, 'element' ) + ' assigned' : 'No elements assigned' );
		return lines.join( '\n' );

	}

	// INTERACTION

	_rowId( event ) {

		return Number( event.target.closest( '.bonsai-sheet-row' )?.dataset.id ) || 0;

	}

	_onSort( event ) {

		const key = event.target.closest( '[data-sort]' )?.dataset.sort;
		if ( ! key ) return;
		const numeric = [ 'quantity', 'appliedValue', 'totalCost', 'share' ].includes( key );
		if ( this.sort.key !== key ) this.sort = { key, descending: numeric };
		else if ( this.sort.descending === numeric ) this.sort = { key, descending: ! numeric };
		else this.sort = { key: '', descending: false };
		this._render();

	}

	_onClick( event ) {

		const toggle = event.target.closest( '[data-toggle]' );
		if ( toggle ) {

			const id = Number( toggle.dataset.toggle );
			if ( this.collapsed.has( id ) ) this.collapsed.delete( id );
			else this.collapsed.add( id );
			this._render();
			return;

		}

		const id = this._rowId( event );
		if ( id ) this._setActive( id, { select: true } );

	}

	_onDoubleClick( event ) {

		if ( event.target.closest( '[data-toggle]' ) ) return;
		const id = this._rowId( event );
		if ( ! id ) return;
		this._setActive( id );
		this._selectActive( { isolate: true } );

	}

	_onKey( event ) {

		const rows = this._visible ?? [];
		if ( ! rows.length ) return;
		const index = rows.findIndex( ( row ) => row.id === this.activeId );
		const row = rows[ index ];
		let handled = true;

		switch ( event.key ) {

			case 'ArrowDown':
				this._setActive( rows[ Math.min( rows.length - 1, index + 1 ) ].id, { select: true } );
				break;
			case 'ArrowUp':
				this._setActive( rows[ Math.max( 0, index - 1 ) ].id, { select: true } );
				break;
			case 'Home':
				this._setActive( rows[ 0 ].id, { select: true } );
				break;
			case 'End':
				this._setActive( rows[ rows.length - 1 ].id, { select: true } );
				break;
			case 'ArrowRight':
				if ( row?.hasChildren && this.collapsed.has( row.id ) ) {

					this.collapsed.delete( row.id );
					this._render();

				} else if ( row?.hasChildren && rows[ index + 1 ] ) {

					this._setActive( rows[ index + 1 ].id, { select: true } );

				}

				break;
			case 'ArrowLeft':
				if ( row?.hasChildren && ! this.collapsed.has( row.id ) && ! this.filter && ! this.unpricedOnly ) {

					this.collapsed.add( row.id );
					this._render();

				} else if ( row?.parentId && this.byId.has( row.parentId ) ) {

					this._setActive( row.parentId, { select: true } );

				}

				break;
			case 'Enter':
				this._selectActive( { isolate: true } );
				break;
			default:
				handled = false;

		}

		if ( handled ) {

			event.preventDefault();
			event.stopPropagation();

		}

	}

	_setActive( id, { select = false } = {} ) {

		this.activeId = id;
		const visible = this._visible?.some( ( row ) => row.id === id );
		if ( ! visible ) this._render();
		for ( const node of this._body.querySelectorAll( '.bonsai-sheet-row.is-active' ) ) {

			node.classList.remove( 'is-active' );
			node.removeAttribute( 'aria-selected' );

		}

		const node = this._body.querySelector( `[data-id="${ id }"]` );
		if ( node ) {

			node.classList.add( 'is-active' );
			node.setAttribute( 'aria-selected', 'true' );
			node.scrollIntoView( { block: 'nearest' } );

		}

		if ( select ) this._selectActive();

	}

	async _selectActive( { isolate = false } = {} ) {

		const row = this.byId.get( this.activeId );
		if ( ! row ) return;
		const { modelId } = this._parseKey( this.key );
		const result = await ops.Cost.SelectItem( modelId, row.id, { isolate } );
		if ( row.id !== this.activeId ) return;
		if ( result?.status === 'CANCELLED' ) {

			this._status.setValue( 'The viewer is not ready yet.' );
			return;

		}

		const { ids = [], products = 0 } = result?.result ?? {};
		const label = row.identification || row.name;
		let message = `${ label }: no elements assigned`;
		if ( products && ids.length ) message = `${ label }: ${ plural( products, 'element' ) } ${ isolate ? 'isolated' : 'selected' }`;
		else if ( products ) message = `${ label }: ${ plural( products, 'element' ) } assigned, none drawn in the viewer`;
		this._status.setValue( message );

	}

	async _onPick( pick ) {

		if ( ! this.key ) return;
		const token = this._token;
		const result = pick?.guid ? await ops.Cost.ProductItems( pick ) : null;
		if ( token !== this._token ) return;

		const { scheduleId } = this._parseKey( this.key );
		const items = result?.result ?? [];
		this.linked = new Set( items.filter( ( item ) => item.scheduleId === scheduleId ).map( ( item ) => item.id ) );

		let reveal = false;
		for ( const id of this.linked ) {

			for ( const parent of ancestorIds( this.byId, id ) ) {

				if ( this.collapsed.delete( parent ) ) reveal = true;

			}

		}

		if ( reveal ) this._render();
		for ( const node of this._body.querySelectorAll( '.bonsai-sheet-row' ) ) {

			node.classList.toggle( 'is-linked', this.linked.has( Number( node.dataset.id ) ) );

		}

		if ( this.linked.size && ! this.linked.has( this.activeId ) ) {

			this._body.querySelector( '.bonsai-sheet-row.is-linked' )?.scrollIntoView( { block: 'nearest' } );

		}

	}

	_expandAll() {

		this.collapsed.clear();
		this._render();

	}

	_collapseAll() {

		this.collapsed = new Set( this.rows.filter( ( row ) => row.hasChildren ).map( ( row ) => row.id ) );
		const row = this.byId.get( this.activeId );
		if ( row && row.parentId ) this.activeId = [ row.id, ...ancestorIds( this.byId, row.id ) ].pop();
		this._render();

	}

	// Every item in the current order, whatever is collapsed or filtered.
	_exportCsv() {

		if ( ! this.rows.length ) return;
		const schedule = this.schedules.find( ( entry ) => this._keyOf( entry ) === this.key );
		const currency = schedule?.currency ?? '';
		const suffix = currency ? ` (${ currency })` : '';
		const header = [ 'Level', 'Code', 'Description', 'Quantity', 'Unit', `Rate${ suffix }`, `Total${ suffix }`, 'Formula', 'Elements' ];
		const lines = [ header ];
		for ( const row of this._ordered() ) {

			const priced = isPriced( row );
			lines.push( [
				row.depth + 1,
				row.identification,
				row.name,
				row.quantity ?? '',
				row.quantity == null ? '' : row.unitSymbol,
				priced ? row.appliedValue : '',
				priced ? row.totalCost : '',
				row.values.map( ( value ) => value.formula ).join( '; ' ),
				row.productCount,
			] );

		}

		const csv = lines.map( ( line ) => line.map( csvCell ).join( ',' ) ).join( '\r\n' );
		const url = URL.createObjectURL( new Blob( [ '﻿', csv ], { type: 'text/csv;charset=utf-8' } ) );
		const link = document.createElement( 'a' );
		link.href = url;
		link.download = `${ ( schedule?.name || 'cost-schedule' ).replace( /[\\/:*?"<>|]+/g, '_' ) }.csv`;
		document.body.append( link );
		link.click();
		link.remove();
		setTimeout( () => URL.revokeObjectURL( url ), 0 );
		this._status.setValue( `Exported ${ plural( this.rows.length, 'item' ) } to ${ link.download }` );

	}

}

// The cost items that price the selected element.
class CostElementPanelUI {

	static id = 'bim.cost';

	static spec = {
		group: 'cost',
		position: 'right',
		id: 'cost-element-panel',
		label: 'Cost',
		icon: 'payments',
		title: 'Element Cost',
		autoShow: false,
	};

	constructor( { context } ) {

		this.context = context;
		this.workspacePanel = null;
		this._token = 0;

		this._card = new SummaryCard( { icon: 'deployed_code' } );
		this._list = new StackPanel( { isVertical: true } ).addClass( 'CostElement-list' );
		this.root = new StackPanel( { isVertical: true } )
			.addClass( 'CostElement' )
			.gap( '10px' )
			.add( this._card, this._list );

		costState( context ).elementPanel = this;

		const { signals } = context;
		signals.objectPicked.add( () => this._refresh() );
		signals.liveIfcReady.add( () => this._refresh() );
		signals.modelCleared.add( () => this._refresh() );
		this._refresh();

	}

	attach( workspacePanel ) {

		this.workspacePanel = workspacePanel;

	}

	toggle() {

		togglePanel( this.workspacePanel );
		return this;

	}

	async _refresh() {

		const token = ++ this._token;
		const pick = this.context.activeObject;
		const result = pick?.guid ? await ops.Cost.ProductItems( pick ) : null;
		if ( token !== this._token ) return;

		const items = result?.result ?? [];
		const row = this._pickedRow( pick );
		this._card
			.setTitle( row?.name || row?.type || ( pick?.guid ? 'Element' : 'No element selected' ) )
			.setSubtitle( pick?.guid
				? `${ row?.type ? `${ row.type }  ·  ` : '' }priced in ${ plural( items.length, 'cost item' ) }`
				: 'Select an element to see what prices it.' );

		this._list.clear();
		if ( ! pick?.guid ) return;
		if ( ! items.length ) {

			this._list.add( new Text( 'No cost item is assigned to this element.' ).addClass( 'CostElement-empty' ) );
			return;

		}

		const money = moneyFormat( Cost.currency( pick.sourceId ) );
		for ( const item of items ) {

			const entry = new Container().addClass( 'CostElement-item' );
			entry.dom.tabIndex = 0;
			entry.dom.setAttribute( 'role', 'button' );
			entry.dom.title = 'Show in the cost schedule';
			const priced = item.values.length > 0;
			const quantity = item.quantity == null ? '' : `${ quantityFormat.format( item.quantity ) } ${ item.unitSymbol } × `;
			entry.dom.append(
				element( 'span', 'CostElement-name', [ item.identification, item.name ].filter( Boolean ).join( '  ' ) ),
				element( 'span', 'CostElement-figures', priced ? `${ quantity }${ money( item.appliedValue ) } = ${ money( item.totalCost ) }` : 'Unpriced' ),
				element( 'span', 'CostElement-schedule', item.schedule ),
			);
			const open = () => this.context.cost?.panel?.reveal( pick.sourceId, item.scheduleId, item.id );
			entry.onClick( open );
			entry.dom.addEventListener( 'keydown', ( event ) => {

				if ( event.key !== 'Enter' && event.key !== ' ' ) return;
				event.preventDefault();
				event.stopPropagation();
				open();

			} );
			this._list.add( entry );

		}

	}

	_pickedRow( pick ) {

		if ( ! pick?.objectId ) return null;
		try {

			return Viewer.get()?.getSelectedObjects().find( ( row ) => row.objectId === pick.objectId ) ?? null;

		} catch {

			return null;

		}

	}

}

export default [ CostPanelUI, CostElementPanelUI ];
