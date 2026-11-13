// This file was generated with the assistance of an AI coding tool.
//
// The Gantt's dialogs: task details and work schedule settings. Each one
// keeps its edits until Save, then runs the Sequence.* operators in order.

import { Container, InputDropdown, StackPanel, Text } from '@aeco-dev/gui';

import ops from '../../ops.js';
import { confirmDialog, FormDialog } from '../../util/dialog.js';
import {
	checkboxInput,
	dropdownInput,
	element,
	field,
	iconButton,
	plural,
	setDropdown,
	textButton,
	textInput,
} from '../../util/sheet.js';

// 'NOTDEFINED' → 'Not defined', 'CONSTRUCTION' → 'Construction'.
export function enumLabel( value ) {

	const words = { NOTDEFINED: 'Not defined', USERDEFINED: 'User defined', NOTSTARTED: 'Not started' };
	if ( words[ value ] ) return words[ value ];
	return value.charAt( 0 ) + value.slice( 1 ).toLowerCase();

}

const SCHEDULE_TYPES = [ 'PLANNED', 'ACTUAL', 'BASELINE', 'NOTDEFINED' ];
const TASK_TYPES = [
	'CONSTRUCTION', 'INSTALLATION', 'DEMOLITION', 'DISMANTLE', 'REMOVAL', 'RENOVATION', 'LOGISTIC', 'MOVE',
	'MAINTENANCE', 'OPERATION', 'ATTENDANCE', 'DISPOSAL', 'USERDEFINED', 'NOTDEFINED',
];
const STATUSES = [ 'NOTSTARTED', 'STARTED', 'COMPLETED', 'ONHOLD' ];
export const SEQUENCE_TYPES = [
	{ value: 'FINISH_START', label: 'Finish to start' },
	{ value: 'START_START', label: 'Start to start' },
	{ value: 'FINISH_FINISH', label: 'Finish to finish' },
	{ value: 'START_FINISH', label: 'Start to finish' },
];
const INDENT = ' ';

// Whole days of an ISO duration such as P5D or P2W, or '' for anything else.
export function durationDays( value ) {

	const match = /^P(?:(\d+)W)?(?:(\d+)D)?$/.exec( value || '' );
	if ( ! match || ( ! match[ 1 ] && ! match[ 2 ] ) ) return '';
	return String( Number( match[ 1 ] || 0 ) * 7 + Number( match[ 2 ] || 0 ) );

}

function taskLabel( task ) {

	return [ task.identification, task.name ].filter( Boolean ).join( '  ' ) || 'Unnamed task';

}

function section( title, ...children ) {

	return new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-section' ).add(
		new Text( title ).addClass( 'bonsai-dialog-heading' ),
		...children,
	);

}

function row( ...children ) {

	return new StackPanel( { isVertical: false } ).addClass( 'bonsai-dialog-row' ).add( ...children );

}

// A text input that suggests values, still taking any text.
function suggestInput( id, values, placeholder ) {

	const input = textInput( () => {}, { placeholder } );
	const list = element( 'datalist' );
	list.id = id;
	list.append( ...values.map( ( value ) => {

		const option = element( 'option' );
		option.value = value;
		option.label = enumLabel( value );
		return option;

	} ) );
	input.dom.setAttribute( 'list', id );
	input.list = list;
	return input;

}

// Run operators one after another; stop at the first that is refused or
// throws. Resolves { done, failed, message }.
export async function runSteps( steps ) {

	let done = 0;
	for ( const step of steps ) {

		let result;
		try {

			result = await step.run();

		} catch ( error ) {

			result = { status: 'CANCELLED', message: error?.message || String( error ) };

		}

		if ( result?.status === 'CANCELLED' ) {

			return { done, failed: step.label, message: result.message || 'it was refused' };

		}

		done ++;

	}

	return { done, failed: '', message: '' };

}

export function stepFailure( outcome ) {

	const saved = outcome.done ? ` The ${ plural( outcome.done, 'change' ) } before it ${ outcome.done === 1 ? 'was' : 'were' } saved.` : '';
	return `Could not ${ outcome.failed }: ${ outcome.message }.${ saved }`;

}

// Everything about one task, staged until Save.
export class TaskDialog {

	// onSaved( message ) reports what was done, for the sheet's status line.
	constructor( { onSaved } ) {

		this.onSaved = onSaved;
		this.task = null;

		this.form = new FormDialog( {
			title: 'Task',
			icon: 'edit_calendar',
			width: '34rem',
			note: 'Nothing changes until you save.',
			onSave: () => this._save(),
			onDelete: () => this._remove(),
			deleteLabel: 'Delete task',
		} );

		this._identification = textInput( () => {}, { placeholder: 'e.g. A.1.2' } );
		this._name = textInput( () => {}, { placeholder: 'What is done' } );
		this._description = textInput( () => {}, { placeholder: 'Optional notes' } );
		this._type = dropdownInput( TASK_TYPES.map( ( value ) => ( { value, label: enumLabel( value ) } ) ), () => {} );
		this._status = suggestInput( `bonsai-task-status-${ Math.random().toString( 36 ).slice( 2 ) }`, STATUSES, 'e.g. Not started' );
		this._milestone = checkboxInput( 'Milestone (a point in time, no duration)', () => {} );

		this._start = textInput( () => {}, { type: 'date' } );
		this._finish = textInput( () => {}, { type: 'date' } );
		this._days = textInput( () => {}, { type: 'number', placeholder: 'days' } );
		this._days.dom.min = '1';
		this._datesNote = new Text( '' ).addClass( 'bonsai-dialog-note' );

		this._outputs = new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-list' );
		this._inputs = new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-list' );
		this._outputsTitle = new Text( '' ).addClass( 'bonsai-dialog-subheading' );
		this._inputsTitle = new Text( '' ).addClass( 'bonsai-dialog-subheading' );

		this._links = new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-list' );
		this._linkPick = new InputDropdown();
		this._linkPick.dom.setAttribute( 'aria-label', 'Task that comes before' );
		this._linkType = dropdownInput( SEQUENCE_TYPES, () => {} );
		this._linkType.setValue( 'FINISH_START' );

		this.form.body.add(
			section( 'Task',
				row( field( 'Code', this._identification ).addClass( 'is-narrow' ), field( 'Name', this._name ) ),
				field( 'Notes', this._description ),
				row( field( 'Kind of work', this._type ), field( 'Status', this._status ) ),
				this._milestone,
			),
			section( 'Dates',
				row( field( 'Start', this._start ), field( 'Finish', this._finish ), field( 'Working days', this._days ).addClass( 'is-narrow' ) ),
				this._datesNote,
			),
			section( 'Elements',
				this._outputsTitle,
				this._outputs,
				row(
					textButton( 'Add selected', 'add_link', () => this._stageSelection( 'outputs' ), { title: 'Add the elements selected in the 3D view: this task builds them' } ),
					textButton( 'Show in 3D', 'center_focus_strong', () => this._show(), { title: 'Select and frame what this task builds and uses' } ),
				),
				this._inputsTitle,
				this._inputs,
				row( textButton( 'Add selected', 'add_link', () => this._stageSelection( 'inputs' ), { title: 'Add the elements selected in the 3D view: this task uses them' } ) ),
			),
			section( 'Depends on',
				this._links,
				row( this._linkPick, this._linkType, textButton( 'Add', 'add', () => this._stageLink() ) ),
			),
		);
		this.form.body.dom.append( this._status.list );

	}

	get isOpen() {

		return this.form.isOpen;

	}

	// Open on a task of the active schedule.
	open( taskId ) {

		const result = ops.Sequence.TaskDetails( { task: taskId } );
		if ( ! result?.result ) return false;
		this._load( result.result );
		this.form.open();
		return true;

	}

	_load( task ) {

		this.task = task;
		this.draft = {
			products: { outputs: { add: new Map(), remove: new Set() }, inputs: { add: new Map(), remove: new Set() } },
			links: { add: new Map(), remove: new Set() },
		};

		this.form.setTitle( taskLabel( task ) );
		this._identification.setValue( task.identification );
		this._name.setValue( task.name );
		this._description.setValue( task.description );
		this._type.setValue( task.predefinedType || 'NOTDEFINED' );
		this._status.setValue( task.status );
		this._milestone.box.setValue( task.isMilestone );

		this._start.setValue( task.time?.scheduleStart?.slice( 0, 10 ) ?? '' );
		this._finish.setValue( task.time?.scheduleFinish?.slice( 0, 10 ) ?? '' );
		const days = durationDays( task.time?.scheduleDuration );
		this._days.setValue( days );
		this._days.dom.placeholder = task.time?.scheduleDuration && ! days ? task.time.scheduleDuration : 'days';
		const hasDates = Boolean( task.time?.scheduleStart || task.time?.scheduleFinish );
		this._datesNote.setValue( task.hasChildren && ! hasDates
			? 'Its subtasks set its dates. Dates typed here belong to this task itself.'
			: 'A new start keeps the working days; a new finish changes them. Tasks that come after move along.' );

		this._renderProducts();
		this._renderLinks();

	}

	_renderProducts() {

		for ( const kind of [ 'outputs', 'inputs' ] ) {

			const list = kind === 'outputs' ? this._outputs : this._inputs;
			const staged = this.draft.products[ kind ];
			const existing = this.task[ kind ];
			const count = existing.length - staged.remove.size + staged.add.size;
			const title = kind === 'outputs' ? this._outputsTitle : this._inputsTitle;
			title.setValue( kind === 'outputs' ? `Builds ${ plural( count, 'element' ) }` : `Uses ${ plural( count, 'element' ) }` );

			list.clear();
			for ( const product of existing ) {

				const removed = staged.remove.has( product.guid );
				list.add( this._line( product.name || product.type, product.type, {
					state: removed ? 'removed' : '',
					action: removed
						? [ 'undo', 'Keep this element', () => staged.remove.delete( product.guid ) ]
						: [ 'close', 'Remove this element from the task', () => staged.remove.add( product.guid ) ],
					after: () => this._renderProducts(),
				} ) );

			}

			for ( const [ guid, label ] of staged.add ) {

				list.add( this._line( label, 'to add', {
					state: 'added',
					action: [ 'close', 'Do not add', () => staged.add.delete( guid ) ],
					after: () => this._renderProducts(),
				} ) );

			}

			if ( ! existing.length && ! staged.add.size ) {

				list.add( new Text( kind === 'outputs' ? 'Nothing yet. Select elements in the 3D view, then Add selected.' : 'None.' ).addClass( 'bonsai-dialog-empty' ) );

			}

		}

	}

	_renderLinks() {

		const staged = this.draft.links;
		this._links.clear();
		for ( const link of this.task.predecessors ) {

			const removed = staged.remove.has( link.id );
			this._links.add( this._line( taskLabel( link ), SEQUENCE_TYPES.find( ( type ) => type.value === link.sequenceType )?.label ?? link.sequenceType, {
				state: removed ? 'removed' : '',
				action: removed
					? [ 'undo', 'Keep this link', () => staged.remove.delete( link.id ) ]
					: [ 'close', 'Remove this link', () => staged.remove.add( link.id ) ],
				after: () => this._renderLinks(),
			} ) );

		}

		for ( const [ id, link ] of staged.add ) {

			this._links.add( this._line( link.label, SEQUENCE_TYPES.find( ( type ) => type.value === link.sequenceType )?.label, {
				state: 'added',
				action: [ 'close', 'Do not add', () => staged.add.delete( id ) ],
				after: () => this._renderLinks(),
			} ) );

		}

		if ( ! this.task.predecessors.length && ! staged.add.size ) {

			this._links.add( new Text( 'Nothing: this task can start any time.' ).addClass( 'bonsai-dialog-empty' ) );

		}

		const taken = new Set( [ this.task.id, ...this.task.predecessors.map( ( link ) => link.id ), ...staged.add.keys() ] );
		const options = ( ops.Sequence.Tasks().result ?? [] )
			.filter( ( task ) => ! taken.has( task.id ) )
			.map( ( task ) => ( { value: String( task.id ), label: `${ INDENT.repeat( task.depth ) }${ taskLabel( task ) }` } ) );
		setDropdown( this._linkPick, [ { value: '', label: 'Choose a task…' }, ...options ], '' );

	}

	// One list line: label, a muted detail, and one action button.
	_line( label, detail, { state, action, after } ) {

		const line = new Container().addClass( 'bonsai-dialog-line' );
		if ( state ) line.addClass( `is-${ state }` );
		line.dom.append( element( 'span', 'bonsai-dialog-line-label', label ), element( 'span', 'bonsai-dialog-line-detail', detail ?? '' ) );
		const [ icon, title, run ] = action;
		line.add( iconButton( icon, title, () => {

			run();
			after();

		} ) );
		return line;

	}

	async _stageSelection( kind ) {

		const result = await ops.Sequence.SelectedProducts();
		const products = result?.result ?? [];
		if ( ! products.length ) {

			this.form.setMessage( 'Select elements in the 3D view first (this model only).', 'error' );
			return;

		}

		const staged = this.draft.products[ kind ];
		const existing = new Set( this.task[ kind ].map( ( product ) => product.guid ) );
		let added = 0;
		for ( const product of products ) {

			if ( existing.has( product.guid ) ) {

				staged.remove.delete( product.guid );
				continue;

			}

			if ( ! staged.add.has( product.guid ) ) added ++;
			staged.add.set( product.guid, product.name || product.type );

		}

		this.form.setMessage( added ? `${ plural( added, 'element' ) } will be added when you save.` : 'Those elements are already on this task.' );
		this._renderProducts();

	}

	_stageLink() {

		const id = Number( this._linkPick.getValue() );
		if ( ! id ) {

			this.form.setMessage( 'Choose the task that comes before this one.', 'error' );
			return;

		}

		const option = this._linkPick.dom.selectedOptions[ 0 ];
		this.draft.links.add.set( id, { label: option.textContent.trim(), sequenceType: this._linkType.getValue() } );
		this.form.setMessage( '' );
		this._renderLinks();

	}

	_show() {

		ops.Sequence.SelectTask( { task: this.task.id, isolate: false, frame: true } );

	}

	// The operator calls Save makes, in order: attributes, links, dates,
	// elements. Each date is its own call, so the API keeps the others.
	_steps() {

		const task = { task: this.task.id };
		const steps = [];
		const attributes = {};
		const text = ( input ) => input.getValue().trim();
		const set = ( key, value, old ) => {

			if ( value !== old ) attributes[ key ] = value;

		};

		set( 'Identification', text( this._identification ) || null, this.task.identification || null );
		set( 'Name', text( this._name ) || 'Unnamed', this.task.name || 'Unnamed' );
		set( 'Description', text( this._description ) || null, this.task.description || null );
		set( 'Status', text( this._status ) || null, this.task.status || null );
		set( 'PredefinedType', this._type.getValue(), this.task.predefinedType || 'NOTDEFINED' );
		set( 'IsMilestone', this._milestone.box.getValue(), this.task.isMilestone );
		if ( Object.keys( attributes ).length ) steps.push( { label: 'rename the task', run: () => ops.Sequence.EditTask( attributes, task ) } );

		// Links first: removing one frees the dates, adding one moves them.
		for ( const id of this.draft.links.remove ) {

			steps.push( { label: 'remove a link', run: () => ops.Sequence.UnassignPredecessor( id, task ) } );

		}

		for ( const [ id, link ] of this.draft.links.add ) {

			steps.push( { label: 'add a link', run: () => ops.Sequence.AssignPredecessor( id, { ...task, sequenceType: link.sequenceType } ) } );

		}

		const start = this._start.getValue();
		const finish = this._finish.getValue();
		const days = this._days.getValue();
		if ( start && start !== ( this.task.time?.scheduleStart?.slice( 0, 10 ) ?? '' ) ) {

			steps.push( { label: 'change the start', run: () => ops.Sequence.EditTaskTime( { ScheduleStart: `${ start }T09:00:00` }, task ) } );

		}

		if ( finish && finish !== ( this.task.time?.scheduleFinish?.slice( 0, 10 ) ?? '' ) ) {

			steps.push( { label: 'change the finish', run: () => ops.Sequence.EditTaskTime( { ScheduleFinish: `${ finish }T17:00:00` }, task ) } );

		}

		if ( days !== '' && days !== durationDays( this.task.time?.scheduleDuration ) ) {

			const whole = Math.round( Number( days ) );
			if ( ! Number.isFinite( whole ) || whole < 1 ) throw new Error( 'Working days must be a whole number of 1 or more.' );
			steps.push( { label: 'change the working days', run: () => ops.Sequence.EditTaskTime( { ScheduleDuration: `P${ whole }D` }, task ) } );

		}

		for ( const kind of [ 'outputs', 'inputs' ] ) {

			const staged = this.draft.products[ kind ];
			if ( staged.remove.size ) steps.push( { label: 'remove elements', run: () => ops.Sequence.UnassignProducts( { ...task, kind, guids: [ ...staged.remove ] } ) } );
			if ( staged.add.size ) steps.push( { label: 'add elements', run: () => ops.Sequence.AssignProducts( { ...task, kind, guids: [ ...staged.add.keys() ] } ) } );

		}

		return steps;

	}

	async _save() {

		let steps;
		try {

			steps = this._steps();

		} catch ( error ) {

			this.form.setMessage( error.message, 'error' );
			return false;

		}

		if ( ! steps.length ) return true;
		const outcome = await runSteps( steps );
		if ( outcome.failed ) {

			this.form.setMessage( stepFailure( outcome ), 'error' );
			// What was saved is now the starting point.
			const fresh = ops.Sequence.TaskDetails( { task: this.task.id } );
			if ( fresh?.result ) {

				this._load( fresh.result );

			}

			return false;

		}

		this.onSaved?.( `Saved ${ taskLabel( { identification: this._identification.getValue().trim(), name: this._name.getValue().trim() } ) }` );
		return true;

	}

	async _remove() {

		const ok = await confirmTaskRemoval( this.task );
		if ( ! ok ) return false;
		const result = await ops.Sequence.RemoveTask( { task: this.task.id } );
		if ( result?.status === 'CANCELLED' ) {

			this.form.setMessage( result.message || 'The task could not be deleted.', 'error' );
			return false;

		}

		this.onSaved?.( `Deleted ${ taskLabel( this.task ) }` );
		return true;

	}

}

export function confirmTaskRemoval( task ) {

	const what = taskLabel( task );
	return confirmDialog( {
		title: 'Delete task',
		message: task.hasChildren ? `Delete “${ what }” and all its subtasks?` : `Delete “${ what }”?`,
		detail: 'Its links and element assignments go too. This cannot be undone, but nothing is written to disk until you save the project.',
		confirmLabel: task.hasChildren ? 'Delete all' : 'Delete',
	} );

}

// Name and kind of a work schedule; or a new one.
export class ScheduleDialog {

	constructor( { onSaved } ) {

		this.onSaved = onSaved;
		this.schedule = null;

		this.form = new FormDialog( {
			title: 'Work schedule',
			icon: 'calendar_month',
			width: '26rem',
			onSave: () => this._save(),
			onDelete: () => this._remove(),
			deleteLabel: 'Delete schedule',
		} );

		this._name = textInput( () => {}, { placeholder: 'e.g. Construction programme' } );
		this._type = dropdownInput( SCHEDULE_TYPES.map( ( value ) => ( { value, label: enumLabel( value ) } ) ), () => {} );
		this.form.body.add(
			field( 'Name', this._name ),
			field( 'Kind', this._type ),
			new Text( 'Planned is the programme you intend; Actual records what happened; Baseline is a frozen copy to compare against.' ).addClass( 'bonsai-dialog-note' ),
		);

	}

	// schedule: { id, modelId, name, predefinedType }, or null for a new one.
	open( schedule ) {

		this.schedule = schedule;
		this.form.setTitle( schedule ? 'Work schedule' : 'New work schedule' );
		this.form.setDeleteHidden( ! schedule );
		this.form.setSaveLabel( schedule ? 'Save' : 'Create' );
		this._name.setValue( schedule?.name ?? 'Construction programme' );
		this._type.setValue( schedule?.predefinedType || 'PLANNED' );
		this.form.open();

	}

	async _save() {

		const name = this._name.getValue().trim() || 'Work schedule';
		const predefinedType = this._type.getValue();
		const schedule = this.schedule;
		let result;
		if ( ! schedule ) result = await ops.Sequence.AddWorkSchedule( { name, predefinedType } );
		else if ( name !== schedule.name || predefinedType !== ( schedule.predefinedType || 'NOTDEFINED' ) ) {

			result = await ops.Sequence.EditWorkSchedule( { Name: name, PredefinedType: predefinedType }, { model: schedule.modelId, schedule: schedule.id } );

		} else return true;

		if ( result?.status === 'CANCELLED' ) {

			this.form.setMessage( result.message || 'The schedule could not be saved.', 'error' );
			return false;

		}

		this.onSaved?.( schedule ? `Saved ${ name }` : `Created ${ name }. Add its first task.` );
		return true;

	}

	async _remove() {

		const schedule = this.schedule;
		const ok = await confirmDialog( {
			title: 'Delete work schedule',
			message: `Delete “${ schedule.name }” and all its tasks?`,
			detail: 'This cannot be undone, but nothing is written to disk until you save the project.',
			confirmLabel: 'Delete schedule',
		} );
		if ( ! ok ) return false;
		const result = await ops.Sequence.RemoveWorkSchedule( { model: schedule.modelId, schedule: schedule.id } );
		if ( result?.status === 'CANCELLED' ) {

			this.form.setMessage( result.message || 'The schedule could not be deleted.', 'error' );
			return false;

		}

		this.onSaved?.( `Deleted ${ schedule.name }` );
		return true;

	}

}
