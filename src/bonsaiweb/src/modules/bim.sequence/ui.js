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
import {
	bindPanelToggle,
	editCell,
	element,
	iconButton,
	plural,
	setButtonLabel,
	setDropdown,
	textButton,
} from '../../util/sheet.js';
import { ancestorIds, visibleRows } from '../../util/tree-rows.js';
import { confirmTaskRemoval, durationDays, ScheduleDialog, TaskDialog } from './dialogs.js';

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

// context.sequence holds the active model, schedule and task (STEP ids).
// Panels read it; only Sequence.* operators change it.
function sequenceState( context ) {

	return context.sequence ?? {};

}

// The cells that can be edited in place, in Tab order.
const EDITABLE = [ 'identification', 'name', 'start', 'finish', 'duration' ];

const HINT = 'Double-click a cell to type in it  ·  Enter opens the task  ·  Insert adds a task';

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
		this.rows = [];
		this.byId = new Map();
		this.collapsed = new Set();
		this.linked = new Set();
		this._loadedKey = '';
		this.filter = '';
		this.criticalOnly = false;
		this.range = null;
		this._token = 0;
		this._resumeEdit = null;

		const onSaved = ( message ) => this._status.setValue( message );
		this.taskDialog = new TaskDialog( { onSaved } );
		this.scheduleDialog = new ScheduleDialog( { onSaved } );

		this._build();

		const { signals } = context;
		signals.liveIfcReady.add( () => this.refresh() );
		signals.modelCleared.add( () => this.refresh() );
		signals.objectPicked.add( ( pick ) => this._onPick( pick ) );
		signals.scheduleChanged.add( ( change ) => {

			if ( change?.module === 'sequence' ) this.refresh();

		} );
		signals.scheduleActivated.add( ( change ) => {

			if ( change?.module === 'sequence' ) this._onActivated();

		} );
		bindPanelToggle( signals, SequencePanelUI.spec.id, () => this.workspacePanel );
		this.refresh();

	}

	attach( workspacePanel ) {

		this.workspacePanel = workspacePanel;

	}

	// STATE — read from context.sequence (.model, .schedule, .task).

	get state() {

		return sequenceState( this.context );

	}

	get key() {

		const { model, schedule } = this.state;
		return schedule ? `${ model }:${ schedule }` : '';

	}

	get activeId() {

		return this.state.task || 0;

	}

	// UI

	_build() {

		this._schedule = new InputDropdown();
		this._schedule.dom.setAttribute( 'aria-label', 'Work schedule' );
		this._schedule.onChange( () => {

			const { modelId, scheduleId } = this._parseKey( this._schedule.getValue() );
			ops.Sequence.Activate( { model: modelId, schedule: scheduleId, task: 0 } );

		} );

		this._search = new InputSearch( 'Filter tasks', ( value ) => {

			this.filter = value.trim().toLowerCase();
			this._render();

		} );

		this._critical = iconButton( 'priority_high', 'Critical tasks only', () => {

			this.criticalOnly = ! this.criticalOnly;
			this._critical.dom.classList.toggle( 'is-active', this.criticalOnly );
			this._render();

		} );

		const divider = () => new Text( '' ).addClass( 'bonsai-sheet-divider' );
		this._editing = [
			textButton( 'Task', 'add', () => this._addTask( 'sibling' ), { title: 'Add a task below the active one (Insert)' } ),
			textButton( 'Subtask', 'subdirectory_arrow_right', () => this._addTask( 'child' ), { title: 'Add a task inside the active one' } ),
			textButton( 'Open', 'edit_note', () => this._openTask(), { title: 'Everything about the active task: dates, elements, links (Enter)' } ),
			iconButton( 'delete', 'Delete the active task (Delete)', () => this._removeTask() ),
		];
		for ( const control of this._editing ) control.addClass( 'is-authoring' );

		const toolbar = new StackPanel( { isVertical: false } )
			.addClass( 'bonsai-sheet-toolbar' )
			.add(
				this._schedule,
				iconButton( 'edit', 'Rename, change or delete this work schedule', () => this._editSchedule() ),
				iconButton( 'calendar_add_on', 'New work schedule', () => this._addSchedule() ),
				divider(),
				...this._editing,
				divider(),
				this._search,
				iconButton( 'unfold_more', 'Expand all', () => this._expandAll() ),
				iconButton( 'unfold_less', 'Collapse all', () => this._collapseAll() ),
				this._critical,
				divider(),
				iconButton( 'center_focus_strong', 'Show only what the active task builds', () => this._selectActive( { isolate: true } ) ),
				iconButton( 'visibility', 'Show everything again', () => ops.Viewer.ShowAll() ),
				iconButton( 'refresh', 'Reload schedules from the model', () => this.refresh() ),
			);

		this._summary = new Text( '' ).addClass( 'bonsai-sheet-summary' );
		this._status = new Text( '' ).addClass( 'bonsai-sheet-status' );
		this._hint = new Text( HINT ).addClass( 'bonsai-sheet-hint' );

		this._header = element( 'div', 'bonsai-sheet-row bonsai-sheet-header SequenceGantt-row' );
		this._body = element( 'div', 'bonsai-sheet-body' );
		this._body.tabIndex = 0;
		this._body.setAttribute( 'role', 'tree' );
		this._body.setAttribute( 'aria-label', 'Tasks' );
		this._empty = element( 'div', 'bonsai-sheet-empty' );
		this._emptyText = element( 'p', 'bonsai-sheet-empty-text' );
		this._emptyAction = textButton( '', 'add', () => this._emptyRun?.() );
		this._emptyAction.addClass( 'primary' );
		this._empty.append( element( 'span', 'bonsai-sheet-empty-icon material-symbols-outlined', 'view_timeline' ), this._emptyText, this._emptyAction.dom );

		this._grid = new Container().addClass( 'bonsai-sheet-grid SequenceGantt' );
		this._grid.dom.append( this._header, this._body, this._empty );

		this._body.addEventListener( 'click', ( event ) => this._onClick( event ) );
		this._body.addEventListener( 'dblclick', ( event ) => this._onDoubleClick( event ) );
		this._body.addEventListener( 'keydown', ( event ) => this._onKey( event ) );

		this.root = new StackPanel( { isVertical: true } )
			.addClass( 'bonsai-sheet' )
			.add(
				toolbar,
				new StackPanel( { isVertical: false } ).addClass( 'bonsai-sheet-info' ).add( this._summary, this._status, this._hint ),
				this._grid,
			);

	}

	// The empty sheet says why, and offers the next step when there is one.
	_setEmpty( message, action = null ) {

		this._emptyText.textContent = message;
		this._emptyAction.setHidden( ! action );
		if ( action ) setButtonLabel( this._emptyAction, action.label );
		this._emptyRun = action?.run ?? null;
		this._empty.hidden = false;

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

		if ( failure || ! schedules.length ) {

			const hasFile = store.models.some( ( entry ) => entry.file );
			if ( failure ) this._clear( `The work schedules could not be read: ${ failure }` );
			else if ( hasFile ) this._clear( 'This model has no work schedule yet. Start one, then add tasks as you would on paper.', { label: 'Start a work schedule', run: () => this._addSchedule() } );
			else this._clear( 'Open an IFC model to plan its construction.' );
			if ( this.state.schedule ) ops.Sequence.Activate( { schedule: 0, task: 0 } );
			return;

		}

		// Reload the active schedule, or make the first one active.
		if ( schedules.some( ( schedule ) => this._keyOf( schedule ) === this.key ) ) await this._open( this.key );
		else ops.Sequence.Activate( { model: schedules[ 0 ].modelId, schedule: schedules[ 0 ].id, task: 0 } );

	}

	// Load a schedule's rows. Reopening the loaded schedule keeps what is
	// collapsed; the active task stays if it is still there.
	async _open( key ) {

		const token = ++ this._token;
		const keepState = key === this._loadedKey;
		const { modelId, scheduleId } = this._parseKey( key );
		let rows;
		try {

			const result = await ops.Sequence.Tasks( { model: modelId, schedule: scheduleId } );
			rows = result?.result ?? [];

		} catch ( error ) {

			if ( token === this._token ) this._clear( `Tasks could not be read: ${ error?.message || error }` );
			return;

		}

		if ( token !== this._token ) return;

		this._loadedKey = key;
		this._schedule.setValue( key );
		this.rows = rows;
		this.byId = new Map( rows.map( ( row ) => [ row.id, row ] ) );
		if ( ! keepState ) {

			this.collapsed = new Set( rows.length > EXPAND_ALL_LIMIT
				? rows.filter( ( row ) => row.hasChildren && row.depth >= 1 ).map( ( row ) => row.id )
				: [] );
			this.linked.clear();
			this._status.setValue( '' );

		}

		this.range = this._range( rows );
		this._summarise();
		this._render();
		// A task that is gone stops being active; otherwise show the active one.
		if ( this.activeId && ! this.byId.has( this.activeId ) ) ops.Sequence.Activate( { task: 0 } );
		else this._applyActive();

	}

	_clear( message, action = null ) {

		this._loadedKey = '';
		this.rows = [];
		this.byId = new Map();
		this.linked.clear();
		this.range = null;
		this._summary.setValue( '' );
		this._status.setValue( '' );
		this._header.replaceChildren();
		this._body.replaceChildren();
		this._setEmpty( message, action );
		this._setAuthoring( false );

	}

	// Task buttons work only on an open schedule.
	_setAuthoring( enabled ) {

		for ( const control of this._editing ) control.dom.classList.toggle( 'is-disabled', ! enabled );

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

		this._setAuthoring( true );
		if ( rows.length ) this._empty.hidden = true;
		else if ( this.rows.length ) this._setEmpty( 'No task matches the filter.' );
		else this._setEmpty( 'No tasks yet. Add the first one, then type its name and dates straight into the sheet.', { label: 'Add the first task', run: () => this._addTask( 'sibling' ) } );
		this._resume();

	}

	_renderHeader() {

		const cells = [ 'Code', 'Task', 'Start', 'Finish', 'Days' ].map( ( label, index ) =>
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
		const open = element( 'span', 'bonsai-sheet-open material-symbols-outlined', 'open_in_new' );
		open.dataset.open = row.id;
		open.title = 'Open the task';
		name.append( open );
		name.dataset.key = 'name';

		const code = element( 'span', 'bonsai-sheet-cell is-code', row.identification );
		const start = element( 'span', 'bonsai-sheet-cell is-date', formatDate( row.start ) );
		const finish = element( 'span', 'bonsai-sheet-cell is-date is-finish', formatDate( row.finish ) );
		const duration = element( 'span', 'bonsai-sheet-cell is-duration', row.duration );
		start.classList.toggle( 'is-derived', row.derived );
		finish.classList.toggle( 'is-derived', row.derived );
		code.dataset.key = 'identification';
		// A summary task's dates come from its subtasks: open it to give it its own.
		if ( ! ( row.hasChildren && row.derived ) ) {

			start.dataset.key = 'start';
			finish.dataset.key = 'finish';
			duration.dataset.key = 'duration';

		}

		node.append( code, name, start, finish, duration, this._renderTrack( row ) );

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

		const open = event.target.closest( '[data-open]' );
		if ( open ) {

			this._setActive( Number( open.dataset.open ) );
			this._openTask();
			return;

		}

		const id = this._rowId( event );
		if ( id && id !== this.activeId ) this._setActive( id, { select: true } );

	}

	// Double-click types into a cell; elsewhere on the row it opens the task.
	_onDoubleClick( event ) {

		if ( event.target.closest( '[data-toggle], [data-open], .bonsai-sheet-input' ) ) return;
		const id = this._rowId( event );
		if ( ! id ) return;
		this._setActive( id );
		const key = event.target.closest( '[data-key]' )?.dataset.key;
		if ( key ) this._editCell( id, key );
		else this._openTask();

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
				this._openTask();
				break;
			case 'F2':
				if ( row ) this._editCell( row.id, 'name' );
				break;
			case 'Insert':
				this._addTask( event.shiftKey ? 'child' : 'sibling' );
				break;
			case 'Delete':
				this._removeTask();
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

		ops.Sequence.Activate( { task: id } );
		if ( select ) this._selectActive();

	}

	// scheduleActivated: open another schedule, or show the active task.
	_onActivated() {

		const key = this.key;
		if ( key !== this._loadedKey ) {

			if ( key ) this._open( key );
			return;

		}

		this._applyActive();

	}

	// Highlight the active task and scroll to it, expanding its parents and
	// dropping a filter that would hide it.
	_applyActive() {

		const id = this.activeId;
		let render = false;
		for ( const parent of ancestorIds( this.byId, id ) ) {

			if ( this.collapsed.delete( parent ) ) render = true;

		}

		if ( id && ( this.filter || this.criticalOnly ) && ! this._visible?.some( ( row ) => row.id === id ) ) {

			this.filter = '';
			this._search.setValue( '' );
			this.criticalOnly = false;
			this._critical.dom.classList.remove( 'is-active' );
			render = true;

		}

		if ( render ) this._render();
		for ( const node of this._body.querySelectorAll( '.bonsai-sheet-row.is-active' ) ) {

			node.classList.remove( 'is-active' );
			node.removeAttribute( 'aria-selected' );

		}

		const node = id ? this._body.querySelector( `[data-id="${ id }"]` ) : null;
		if ( node ) {

			node.classList.add( 'is-active' );
			node.setAttribute( 'aria-selected', 'true' );
			node.scrollIntoView( { block: 'nearest' } );

		}

	}

	async _selectActive( { isolate = false } = {} ) {

		const row = this.byId.get( this.activeId );
		if ( ! row ) return;
		const { modelId } = this._parseKey( this.key );
		const result = await ops.Sequence.SelectTask( { model: modelId, task: row.id, isolate } );
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

	// AUTHORING

	// Run an authoring operator; report a refusal or an error on the status line.
	async _run( run, done ) {

		let result;
		try {

			result = await run();

		} catch ( error ) {

			result = { status: 'CANCELLED', message: error?.message || String( error ) };

		}

		if ( result?.status === 'CANCELLED' ) {

			this._status.setValue( result.message || 'The change could not be made.' );
			return null;

		}

		if ( done ) this._status.setValue( done );
		return result;

	}

	// Sequence.AddTask places it below or inside the active task and makes
	// it active; the reload that follows shows it, with its name ready to type.
	async _addTask( placement ) {

		if ( ! this.key ) return;
		if ( placement === 'child' && ! this.activeId ) {

			this._status.setValue( 'Choose the task to add a subtask to.' );
			return;

		}

		const result = await this._run( () => ops.Sequence.AddTask( { placement, name: 'New task' } ), 'Task added: type its name' );
		if ( result?.result ) this._resumeEdit = { id: result.result, key: 'name' };
		this._resume();

	}

	async _removeTask() {

		const row = this.byId.get( this.activeId );
		if ( ! row ) {

			this._status.setValue( 'Choose the task to delete.' );
			return;

		}

		if ( ! await confirmTaskRemoval( row ) ) return;
		this._run( () => ops.Sequence.RemoveTask( { task: row.id } ), `Deleted ${ row.identification || row.name }` );

	}

	_openTask() {

		if ( ! this.activeId ) {

			this._status.setValue( 'Choose a task first.' );
			return;

		}

		this.taskDialog.open( this.activeId );

	}

	_addSchedule() {

		if ( ! store.models.some( ( entry ) => entry.file ) ) {

			this._status.setValue( 'Open an IFC model first.' );
			return;

		}

		this.scheduleDialog.open( null );

	}

	_editSchedule() {

		const schedule = this.schedules.find( ( entry ) => this._keyOf( entry ) === this.key );
		if ( schedule ) this.scheduleDialog.open( schedule );
		else this._addSchedule();

	}

	// IN-PLACE EDITING

	_editCell( id, key ) {

		const row = this.byId.get( id );
		const node = this._body.querySelector( `[data-id="${ id }"]` );
		let cell = node?.querySelector( `[data-key="${ key }"]` );
		if ( ! row || ! cell ) return;
		if ( key === 'name' ) cell = cell.querySelector( '.bonsai-sheet-label' );

		const details = [ 'start', 'finish', 'duration' ].includes( key ) ? ops.Sequence.TaskDetails( { task: id } ).result : null;
		const values = {
			identification: row.identification,
			name: row.name,
			start: details?.time?.scheduleStart?.slice( 0, 10 ) ?? '',
			finish: details?.time?.scheduleFinish?.slice( 0, 10 ) ?? '',
			duration: durationDays( details?.time?.scheduleDuration ),
		};
		const types = { start: 'date', finish: 'date', duration: 'number' };
		const placeholders = { identification: 'Code', name: 'Task name', duration: 'Days' };

		editCell( cell, {
			value: values[ key ],
			type: types[ key ] ?? 'text',
			placeholder: placeholders[ key ] ?? '',
			onCommit: ( text, move ) => this._commitCell( row, key, text.trim(), move ),
			onMove: ( move ) => this._moveEdit( row.id, key, move ),
		} );

	}

	// The next editable cell of the row, wrapping to the next row.
	_moveEdit( id, key, move ) {

		const rows = this._visible ?? [];
		let index = rows.findIndex( ( row ) => row.id === id );
		let column = EDITABLE.indexOf( key );
		while ( index >= 0 && index < rows.length ) {

			column += move;
			if ( column >= EDITABLE.length ) {

				column = 0;
				index ++;

			} else if ( column < 0 ) {

				column = EDITABLE.length - 1;
				index --;

			}

			const row = rows[ index ];
			if ( ! row ) return;
			const cell = this._body.querySelector( `[data-id="${ row.id }"] [data-key="${ EDITABLE[ column ] }"]` );
			if ( cell ) {

				if ( row.id !== this.activeId ) this._setActive( row.id );
				this._editCell( row.id, EDITABLE[ column ] );
				return;

			}

		}

	}

	// After the reload a change causes, carry on where the edit left off.
	_resume() {

		const next = this._resumeEdit;
		if ( ! next || ! this.byId.has( next.id ) ) return;
		if ( ! this._body.querySelector( `[data-id="${ next.id }"]` ) ) return;
		this._resumeEdit = null;
		if ( next.move ) this._moveEdit( next.id, next.key, next.move );
		else this._editCell( next.id, next.key );

	}

	async _commitCell( row, key, text, move ) {

		const task = { task: row.id };
		let run;
		if ( key === 'identification' ) run = () => ops.Sequence.EditTask( { Identification: text || null }, task );
		else if ( key === 'name' ) run = () => ops.Sequence.EditTask( { Name: text || 'Unnamed' }, task );
		else if ( key === 'start' && text ) run = () => ops.Sequence.EditTaskTime( { ScheduleStart: `${ text }T09:00:00` }, task );
		else if ( key === 'finish' && text ) run = () => ops.Sequence.EditTaskTime( { ScheduleFinish: `${ text }T17:00:00` }, task );
		else if ( key === 'duration' && text ) {

			const days = Math.round( Number( text ) );
			if ( ! Number.isFinite( days ) || days < 1 ) {

				this._status.setValue( 'Working days must be a whole number of 1 or more.' );
				return;

			}

			run = () => ops.Sequence.EditTaskTime( { ScheduleDuration: `P${ days }D` }, task );

		}

		if ( ! run ) {

			// Clearing a date is done from the task dialog.
			if ( move ) this._moveEdit( row.id, key, move );
			return;

		}

		if ( move ) this._resumeEdit = { id: row.id, key, move };
		const result = await this._run( run, '' );
		if ( ! result ) {

			this._resumeEdit = null;
			return;

		}

		// A link can hold a date where it is: say so rather than ignore the edit.
		if ( key === 'start' || key === 'finish' ) {

			const task = ops.Sequence.TaskDetails( { task: row.id } ).result;
			const kept = key === 'start' ? task?.time?.scheduleStart : task?.time?.scheduleFinish;
			if ( kept && kept.slice( 0, 10 ) !== text ) {

				const link = task.predecessors[ 0 ];
				const why = link ? ` its link to ${ link.identification || link.name } holds it` : ' the schedule holds it';
				this._status.setValue( `The ${ key } stays ${ formatDate( kept ) }:${ why }. Open the task to change its links.` );

			}

		}

	}

	_collapseAll() {

		this.collapsed = new Set( this.rows.filter( ( row ) => row.hasChildren ).map( ( row ) => row.id ) );
		this._render();
		const row = this.byId.get( this.activeId );
		if ( row?.parentId ) ops.Sequence.Activate( { task: [ row.id, ...ancestorIds( this.byId, row.id ) ].pop() } );

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

		const { signals } = context;
		bindPanelToggle( signals, SequenceTasksPanelUI.spec.id, () => this.workspacePanel );
		signals.objectPicked.add( () => this._refresh() );
		signals.liveIfcReady.add( () => this._refresh() );
		signals.modelCleared.add( () => this._refresh() );
		this._refresh();

	}

	attach( workspacePanel ) {

		this.workspacePanel = workspacePanel;

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
			const open = () => ops.Sequence.Activate( { model: pick.sourceId, schedule: task.scheduleId, task: task.id, show: true } );
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
