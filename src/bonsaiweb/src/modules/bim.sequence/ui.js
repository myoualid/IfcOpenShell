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
import { Viewer } from '../../tool/Viewer.js';
import { element, iconButton, plural, setDropdown, showPanel, togglePanel } from '../../util/sheet.js';
import { ancestorIds, visibleRows } from '../../util/tree-rows.js';

const DAY = 86400000;

// Large schedules open with their top two levels expanded.
const EXPAND_ALL_LIMIT = 300;

// ISO date or date-time string from tool.Sequence → epoch ms. A date-only
// string would parse as UTC, so it is read as local midnight like the rest.
function toTime( value ) {

	if ( ! value ) return NaN;
	return Date.parse( /^\d{4}-\d{2}-\d{2}$/.test( value ) ? `${ value }T00:00:00` : value );

}

const dateFormat = new Intl.DateTimeFormat( undefined, { day: '2-digit', month: 'short', year: '2-digit' } );

function formatDate( value ) {

	const time = toTime( value );
	return Number.isFinite( time ) ? dateFormat.format( time ) : '';

}

// Tick marks for the timeline header: weeks, months or years, by span.
function timelineTicks( start, end ) {

	const span = end - start;
	const ticks = [];
	const cursor = new Date( start );
	cursor.setHours( 0, 0, 0, 0 );
	let format;
	let step;

	if ( span <= 70 * DAY ) {

		cursor.setDate( cursor.getDate() - ( ( cursor.getDay() + 6 ) % 7 ) );
		format = new Intl.DateTimeFormat( undefined, { day: 'numeric', month: 'short' } );
		step = () => cursor.setDate( cursor.getDate() + 7 );

	} else if ( span <= 3 * 365 * DAY ) {

		cursor.setDate( 1 );
		format = new Intl.DateTimeFormat( undefined, { month: 'short', year: '2-digit' } );
		const months = span <= 400 * DAY ? 1 : 3;
		cursor.setMonth( cursor.getMonth() - ( cursor.getMonth() % months ) );
		step = () => cursor.setMonth( cursor.getMonth() + months );

	} else {

		cursor.setMonth( 0, 1 );
		format = new Intl.DateTimeFormat( undefined, { year: 'numeric' } );
		step = () => cursor.setFullYear( cursor.getFullYear() + 1 );

	}

	while ( cursor.getTime() <= end ) {

		const time = cursor.getTime();
		if ( time >= start ) ticks.push( { pct: ( ( time - start ) / span ) * 100, label: format.format( time ) } );
		step();

	}

	return ticks;

}

function sequenceState( context ) {

	context.sequence ??= {};
	return context.sequence;

}

class SequencePanelUI {

	static id = 'bim.sequence';

	static spec = {
		group: 'sequence',
		position: 'bottom',
		id: 'sequence-panel',
		label: 'Schedule',
		icon: 'view_timeline',
		title: 'Work Schedule',
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
		this.criticalOnly = false;
		this.range = null;
		this._token = 0;

		this._build();
		sequenceState( context ).panel = this;

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

	// Open a schedule at one task: expand to it, make it active, scroll to it.
	async reveal( modelId, scheduleId, taskId ) {

		this.show();
		const key = `${ modelId }:${ scheduleId }`;
		if ( key !== this.key ) {

			if ( ! this.schedules.some( ( schedule ) => this._keyOf( schedule ) === key ) ) await this.refresh();
			await this._open( key );

		}

		if ( ! this.byId.has( taskId ) ) return;
		this.filter = '';
		this._search.setValue( '' );
		this.criticalOnly = false;
		this._critical.dom.classList.remove( 'is-active' );
		for ( const id of ancestorIds( this.byId, taskId ) ) this.collapsed.delete( id );
		this._setActive( taskId, { select: true } );

	}

	// UI

	_build() {

		this._schedule = new InputDropdown();
		this._schedule.dom.setAttribute( 'aria-label', 'Work schedule' );
		this._schedule.onChange( () => this._open( this._schedule.getValue() ) );

		this._search = new InputSearch( 'Filter tasks', ( value ) => {

			this.filter = value.trim().toLowerCase();
			this._render();

		} );

		this._critical = iconButton( 'priority_high', 'Critical tasks only', () => {

			this.criticalOnly = ! this.criticalOnly;
			this._critical.dom.classList.toggle( 'is-active', this.criticalOnly );
			this._render();

		} );

		const toolbar = new StackPanel( { isVertical: false } )
			.addClass( 'bonsai-sheet-toolbar' )
			.add(
				this._schedule,
				this._search,
				iconButton( 'unfold_more', 'Expand all', () => this._expandAll() ),
				iconButton( 'unfold_less', 'Collapse all', () => this._collapseAll() ),
				this._critical,
				iconButton( 'center_focus_strong', 'Isolate the active task', () => this._selectActive( { isolate: true } ) ),
				iconButton( 'visibility', 'Show all objects', () => ops.Viewer.ShowAll() ),
				iconButton( 'refresh', 'Reload schedules from the model', () => this.refresh() ),
			);

		this._summary = new Text( '' ).addClass( 'bonsai-sheet-summary' );
		this._status = new Text( '' ).addClass( 'bonsai-sheet-status' );

		this._header = element( 'div', 'bonsai-sheet-row bonsai-sheet-header SequenceGantt-row' );
		this._body = element( 'div', 'bonsai-sheet-body' );
		this._body.tabIndex = 0;
		this._body.setAttribute( 'role', 'tree' );
		this._body.setAttribute( 'aria-label', 'Tasks' );
		this._empty = element( 'div', 'bonsai-sheet-empty' );

		this._grid = new Container().addClass( 'bonsai-sheet-grid SequenceGantt' );
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

			const result = await ops.Sequence.Schedules();
			schedules = result?.result ?? [];

		} catch ( error ) {

			failure = error?.message || String( error );

		}

		if ( token !== this._token ) return;
		this.schedules = schedules;

		const several = new Set( schedules.map( ( schedule ) => schedule.modelId ) ).size > 1;
		setDropdown( this._schedule, schedules.map( ( schedule ) => ( {
			value: this._keyOf( schedule ),
			label: several ? `${ schedule.name } — ${ schedule.modelName }` : schedule.name,
		} ) ), this.key );

		if ( failure ) {

			this._clear( `Work schedules could not be read: ${ failure }` );
			return;

		}

		if ( ! schedules.length ) {

			this._clear( store.models.some( ( entry ) => entry.file )
				? 'No work schedules (IfcWorkSchedule) in the open IFC files.'
				: 'Open an IFC file to plan with its work schedules.' );
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

			const result = await ops.Sequence.Tasks( modelId, scheduleId );
			rows = result?.result ?? [];

		} catch ( error ) {

			if ( token === this._token ) this._clear( `Tasks could not be read: ${ error?.message || error }` );
			return;

		}

		if ( token !== this._token ) return;

		this.key = key;
		this._schedule.setValue( key );
		this.rows = rows;
		this.byId = new Map( rows.map( ( row ) => [ row.id, row ] ) );
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

		this.range = this._range( rows );
		this._summarise();
		this._render();

	}

	_clear( message ) {

		this.key = '';
		this.rows = [];
		this.byId = new Map();
		this.activeId = 0;
		this.linked.clear();
		this.range = null;
		this._summary.setValue( '' );
		this._status.setValue( '' );
		this._header.replaceChildren();
		this._body.replaceChildren();
		this._empty.textContent = message;
		this._empty.hidden = false;

	}

	_range( rows ) {

		let start = Infinity;
		let end = - Infinity;
		for ( const row of rows ) {

			const a = toTime( row.start );
			const b = toTime( row.finish );
			if ( Number.isFinite( a ) ) start = Math.min( start, a );
			if ( Number.isFinite( b ) ) end = Math.max( end, b );
			if ( Number.isFinite( a ) && ! Number.isFinite( b ) ) end = Math.max( end, a );

		}

		if ( ! Number.isFinite( start ) || ! Number.isFinite( end ) ) return null;
		if ( end <= start ) end = start + DAY;
		const pad = ( end - start ) * 0.02;
		return { start: start - pad, end: end + pad, first: start, last: end };

	}

	_summarise() {

		const rows = this.rows;
		const leaves = rows.filter( ( row ) => ! row.hasChildren );
		const parts = [ plural( rows.length, 'task' ) ];
		const milestones = rows.filter( ( row ) => row.isMilestone ).length;
		const critical = rows.filter( ( row ) => row.isCritical ).length;
		const undated = leaves.filter( ( row ) => ! row.start && ! row.finish ).length;
		const linked = leaves.filter( ( row ) => row.outputCount + row.inputCount > 0 ).length;
		if ( milestones ) parts.push( plural( milestones, 'milestone' ) );
		if ( critical ) parts.push( `${ critical } critical` );
		if ( undated ) parts.push( `${ undated } undated` );
		parts.push( `${ linked } of ${ plural( leaves.length, 'work task' ) } linked to elements` );
		if ( this.range ) {

			const days = Math.round( ( this.range.last - this.range.first ) / DAY );
			parts.push( `${ dateFormat.format( this.range.first ) } → ${ dateFormat.format( this.range.last ) } (${ plural( days, 'day' ) })` );

		}

		this._summary.setValue( parts.join( '  ·  ' ) );

	}

	// RENDER

	_render() {

		if ( ! this.key ) return;

		this._renderHeader();

		const text = this.filter;
		const tests = [];
		if ( text ) tests.push( ( row ) => row.name.toLowerCase().includes( text ) || row.identification.toLowerCase().includes( text ) );
		if ( this.criticalOnly ) tests.push( ( row ) => row.isCritical );
		const match = tests.length ? ( row ) => tests.every( ( test ) => test( row ) ) : null;
		const rows = visibleRows( this.rows, { collapsed: this.collapsed, match } );

		this._visible = rows;
		const fragment = document.createDocumentFragment();
		for ( const row of rows ) fragment.append( this._renderRow( row, Boolean( match ) ) );
		this._body.replaceChildren( fragment );

		this._empty.hidden = rows.length > 0;
		this._empty.textContent = this.rows.length ? 'No tasks match.' : 'This schedule has no tasks yet.';

	}

	_renderHeader() {

		const cells = [ 'Code', 'Task', 'Start', 'Finish', 'Dur.' ].map( ( label, index ) =>
			element( 'span', `bonsai-sheet-cell ${ [ 'is-code', 'is-name', 'is-date', 'is-date is-finish', 'is-duration' ][ index ] }`, label ) );
		const track = element( 'span', 'bonsai-sheet-cell SequenceGantt-track' );
		if ( this.range ) {

			for ( const tick of timelineTicks( this.range.start, this.range.end ) ) {

				const label = element( 'span', 'SequenceGantt-tick', tick.label );
				label.style.left = `${ tick.pct }%`;
				track.append( label );

			}

		}

		this._header.replaceChildren( ...cells, track );

		const now = Date.now();
		const today = this.range && now >= this.range.start && now <= this.range.end
			? ( ( now - this.range.start ) / ( this.range.end - this.range.start ) ) * 100
			: null;
		this._grid.dom.classList.toggle( 'has-today', today !== null );
		if ( today !== null ) this._grid.dom.style.setProperty( '--today', `${ today }%` );

	}

	_renderRow( row, filtered ) {

		const node = element( 'div', 'bonsai-sheet-row SequenceGantt-row' );
		node.dataset.id = row.id;
		node.setAttribute( 'role', 'treeitem' );
		node.setAttribute( 'aria-level', String( row.depth + 1 ) );
		node.classList.toggle( 'is-summary', row.hasChildren );
		node.classList.toggle( 'is-active', row.id === this.activeId );
		node.classList.toggle( 'is-linked', this.linked.has( row.id ) );
		node.classList.toggle( 'is-critical', row.isCritical );
		node.classList.toggle( 'is-unassigned', ! row.hasChildren && row.outputCount + row.inputCount === 0 );
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

		if ( row.isMilestone ) name.append( element( 'span', 'SequenceGantt-flag material-symbols-outlined', 'flag' ) );
		name.append( element( 'span', 'bonsai-sheet-label', row.name ) );

		const start = element( 'span', 'bonsai-sheet-cell is-date', formatDate( row.start ) );
		const finish = element( 'span', 'bonsai-sheet-cell is-date is-finish', formatDate( row.finish ) );
		start.classList.toggle( 'is-derived', row.derived );
		finish.classList.toggle( 'is-derived', row.derived );

		node.append(
			element( 'span', 'bonsai-sheet-cell is-code', row.identification ),
			name,
			start,
			finish,
			element( 'span', 'bonsai-sheet-cell is-duration', row.duration ),
			this._renderTrack( row ),
		);

		const lines = [ [ row.identification, row.name ].filter( Boolean ).join( ' ' ) ];
		if ( row.start || row.finish ) lines.push( `${ formatDate( row.start ) || '?' } → ${ formatDate( row.finish ) || '?' }${ row.duration ? `  (${ row.duration })` : '' }${ row.derived ? '  from subtasks' : '' }` );
		if ( row.isCritical ) lines.push( 'Critical' );
		if ( row.completion !== null ) lines.push( `${ Math.round( row.completion * 100 ) }% complete` );
		if ( row.status ) lines.push( `Status: ${ row.status }` );
		if ( ! row.hasChildren ) lines.push( `${ plural( row.outputCount, 'output' ) }, ${ plural( row.inputCount, 'input' ) }` );
		node.title = lines.join( '\n' );
		return node;

	}

	_renderTrack( row ) {

		const track = element( 'span', 'bonsai-sheet-cell SequenceGantt-track' );
		const range = this.range;
		if ( ! range ) return track;

		const start = toTime( row.start );
		const finish = toTime( row.finish );
		if ( ! Number.isFinite( start ) && ! Number.isFinite( finish ) ) return track;

		const span = range.end - range.start;
		const a = Number.isFinite( start ) ? start : finish;
		const b = Number.isFinite( finish ) ? finish : start;
		const left = ( ( a - range.start ) / span ) * 100;

		if ( row.isMilestone || b <= a ) {

			const mark = element( 'span', 'SequenceGantt-milestone' );
			mark.style.left = `${ left }%`;
			track.append( mark );
			return track;

		}

		const bar = element( 'span', row.hasChildren ? 'SequenceGantt-bar is-summary' : 'SequenceGantt-bar' );
		bar.style.left = `${ left }%`;
		bar.style.width = `${ Math.max( 0.4, ( ( b - a ) / span ) * 100 ) }%`;
		if ( row.completion !== null && ! row.hasChildren ) {

			const done = element( 'span', 'SequenceGantt-progress' );
			done.style.width = `${ Math.min( 100, Math.max( 0, row.completion * 100 ) ) }%`;
			bar.append( done );

		}

		track.append( bar );
		return track;

	}

	// INTERACTION

	_rowId( event ) {

		return Number( event.target.closest( '.bonsai-sheet-row' )?.dataset.id ) || 0;

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
				if ( row?.hasChildren && ! this.collapsed.has( row.id ) && ! this.filter && ! this.criticalOnly ) {

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
		const result = await ops.Sequence.SelectTask( modelId, row.id, { isolate } );
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
		const result = pick?.guid ? await ops.Sequence.ProductTasks( pick ) : null;
		if ( token !== this._token ) return;

		const { scheduleId } = this._parseKey( this.key );
		const tasks = result?.result ? [ ...result.result.outputs, ...result.result.inputs ] : [];
		this.linked = new Set( tasks.filter( ( task ) => task.scheduleId === scheduleId ).map( ( task ) => task.id ) );

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
		const root = this.byId.get( this.activeId );
		if ( root && root.parentId ) this.activeId = [ root.id, ...ancestorIds( this.byId, root.id ) ].pop();
		this._render();

	}

}

// The tasks that build or use the selected element.
class SequenceTasksPanelUI {

	static id = 'bim.sequence';

	static spec = {
		group: 'sequence',
		position: 'right',
		id: 'sequence-tasks-panel',
		label: 'Tasks',
		icon: 'event_note',
		title: 'Element Tasks',
		autoShow: false,
	};

	constructor( { context } ) {

		this.context = context;
		this.workspacePanel = null;
		this._token = 0;

		this._card = new SummaryCard( { icon: 'deployed_code' } );
		this._outputs = new StackPanel( { isVertical: true } ).addClass( 'SequenceTasks-list' );
		this._inputs = new StackPanel( { isVertical: true } ).addClass( 'SequenceTasks-list' );
		this._outputsTitle = new Text( 'Built by' ).addClass( 'SequenceTasks-title' );
		this._inputsTitle = new Text( 'Used by' ).addClass( 'SequenceTasks-title' );

		this.root = new StackPanel( { isVertical: true } )
			.addClass( 'SequenceTasks' )
			.gap( '10px' )
			.add( this._card, this._outputsTitle, this._outputs, this._inputsTitle, this._inputs );

		sequenceState( context ).tasksPanel = this;

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
		const result = pick?.guid ? await ops.Sequence.ProductTasks( pick ) : null;
		if ( token !== this._token ) return;

		const { outputs = [], inputs = [] } = result?.result ?? {};
		const row = this._pickedRow( pick );
		this._card
			.setTitle( row?.name || row?.type || ( pick?.guid ? 'Element' : 'No element selected' ) )
			.setSubtitle( pick?.guid
				? `${ row?.type ? `${ row.type }  ·  ` : '' }${ plural( outputs.length + inputs.length, 'task' ) }`
				: 'Select an element to see when it is built.' );

		this._fill( this._outputs, this._outputsTitle, outputs, pick, 'No task builds this element.' );
		this._fill( this._inputs, this._inputsTitle, inputs, pick, 'No task uses this element.' );

	}

	_pickedRow( pick ) {

		if ( ! pick?.objectId ) return null;
		try {

			return Viewer.get()?.getSelectedObjects().find( ( row ) => row.objectId === pick.objectId ) ?? null;

		} catch {

			return null;

		}

	}

	_fill( list, title, tasks, pick, emptyText ) {

		list.clear();
		title.setHidden( ! pick?.guid );
		list.setHidden( ! pick?.guid );
		if ( ! pick?.guid ) return;

		if ( ! tasks.length ) {

			list.add( new Text( emptyText ).addClass( 'SequenceTasks-empty' ) );
			return;

		}

		for ( const task of tasks ) {

			const item = new Container().addClass( 'SequenceTasks-item' );
			item.dom.tabIndex = 0;
			item.dom.setAttribute( 'role', 'button' );
			item.dom.title = 'Show in the work schedule';
			item.dom.append(
				element( 'span', 'SequenceTasks-name', [ task.identification, task.name ].filter( Boolean ).join( '  ' ) ),
				element( 'span', 'SequenceTasks-schedule', task.schedule ),
			);
			const open = () => this.context.sequence?.panel?.reveal( pick.sourceId, task.scheduleId, task.id );
			item.onClick( open );
			item.dom.addEventListener( 'keydown', ( event ) => {

				if ( event.key !== 'Enter' && event.key !== ' ' ) return;
				event.preventDefault();
				event.stopPropagation();
				open();

			} );
			list.add( item );

		}

	}

}

export default [ SequencePanelUI, SequenceTasksPanelUI ];
