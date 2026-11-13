// This file was generated with the assistance of an AI coding tool.
//
// Sequence.* operators. The active model, work schedule and task are
// context.sequence.model, .schedule and .task (STEP ids); every operator
// works on them unless its options name others. Operators that change that
// state dispatch scheduleActivated; operators that change the IFC file
// dispatch scheduleChanged; panel toggles dispatch panelToggled. Panels
// only listen. Authoring operators carry the logic of Bonsai's
// core/sequence.py and call tool.Sequence for each step. They are not
// undoable: the IFC file has no transactions.

import { Operator } from '../../ops.js';
import { store } from '../../context/store.js';
import { Ifc } from '../../tool/Ifc.js';
import { Sequence } from '../../tool/Sequence.js';
import { Viewer } from '../../tool/Viewer.js';

const OPTIONS = { name: 'options', type: 'object', optional: true };
const ATTRIBUTES = { name: 'attributes', type: 'object' };

// Resolves what an operator acts on: options.model / .schedule / .task when
// given, else the active ones on context.sequence.
class SequenceOperator extends Operator {

	constructor( context, options = {} ) {

		super( context );
		this.options = options ?? {};

	}

	get state() {

		return this.context.sequence ?? {};

	}

	get model() {

		return this.options.model ?? this.state.model ?? null;

	}

	get file() {

		return Ifc.get( this.model );

	}

	get schedule() {

		return Ifc.byId( this.model, this.options.schedule ?? this.state.schedule, 'IfcWorkSchedule' );

	}

	get task() {

		return Ifc.byId( this.model, this.options.task ?? this.state.task, 'IfcTask' );

	}

	// Move the active state and tell the panels.
	activate( changes ) {

		this.context.sequence ??= {};
		Object.assign( this.context.sequence, changes );
		this.context.signals.scheduleActivated.dispatch( { module: 'sequence' } );

	}

	changed() {

		this.context.signals.scheduleChanged.dispatch( { module: 'sequence', modelId: this.model } );

	}

}

// PANELS

class SequenceToggle extends Operator {

	static operatorName = 'Sequence.Toggle';
	static operatorLabel = 'Toggle Work Schedule';

	execute() {

		this.context.signals.panelToggled.dispatch( { id: 'sequence-panel' } );
		return { status: 'FINISHED' };

	}

}

class SequenceToggleTasks extends Operator {

	static operatorName = 'Sequence.ToggleTasks';
	static operatorLabel = 'Toggle Element Tasks';

	execute() {

		this.context.signals.panelToggled.dispatch( { id: 'sequence-tasks-panel' } );
		return { status: 'FINISHED' };

	}

}

// STATE

// Make a model, schedule and task active: options.model, .schedule, .task
// (a task of 0 clears it). With options.show, also show the Gantt.
class SequenceActivate extends SequenceOperator {

	static operatorName = 'Sequence.Activate';
	static operatorLabel = 'Activate Schedule or Task';
	static operatorArgs = [ OPTIONS ];

	execute() {

		const changes = {};
		for ( const key of [ 'model', 'schedule', 'task' ] ) {

			if ( this.options[ key ] !== undefined ) changes[ key ] = this.options[ key ];

		}

		this.activate( changes );
		if ( this.options.show ) this.context.signals.panelToggled.dispatch( { id: 'sequence-panel', show: true } );
		return { status: 'FINISHED' };

	}

}

// READ

class SequenceSchedules extends Operator {

	static operatorName = 'Sequence.Schedules';
	static operatorLabel = 'Work Schedules';

	execute() {

		return { status: 'FINISHED', result: Sequence.schedules() };

	}

}

class SequenceTasks extends SequenceOperator {

	static operatorName = 'Sequence.Tasks';
	static operatorLabel = 'Work Schedule Tasks';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.schedule );

	}

	execute() {

		return { status: 'FINISHED', result: Sequence.taskRows( this.schedule ) };

	}

}

class SequenceTaskDetails extends SequenceOperator {

	static operatorName = 'Sequence.TaskDetails';
	static operatorLabel = 'Task Details';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.task );

	}

	execute() {

		return { status: 'FINISHED', result: Sequence.taskDetails( this.task ) };

	}

}

class SequenceProductTasks extends Operator {

	static operatorName = 'Sequence.ProductTasks';
	static operatorLabel = 'Tasks for Selection';

	constructor( context, pick ) {

		super( context );
		this.pick = pick === undefined ? context.activeObject : pick;

	}

	execute() {

		const product = Ifc.byGuid( this.pick?.sourceId, this.pick?.guid );
		const result = product ? Sequence.productTasks( product ) : { outputs: [], inputs: [] };
		return { status: 'FINISHED', result };

	}

}

// The products selected in the viewport, in the active model (or
// options.model): [ { guid, name, type } ]. The task dialog stages them.
class SequenceSelectedProducts extends SequenceOperator {

	static operatorName = 'Sequence.SelectedProducts';
	static operatorLabel = 'Selected Products';
	static operatorArgs = [ OPTIONS ];

	async execute() {

		const result = [];
		for ( const guid of await Viewer.selectedGuids( this.model ) ) {

			const product = Ifc.byGuid( this.model, guid );
			if ( product?.isA( 'IfcProduct' ) ) result.push( { guid, name: product.Name ?? '', type: product.isA() } );

		}

		return { status: 'FINISHED', result };

	}

}

// Select what a task builds and uses; with options.isolate, hide everything
// else. A summary task selects the products of all its subtasks.
class SequenceSelectTask extends SequenceOperator {

	static operatorName = 'Sequence.SelectTask';
	static operatorLabel = 'Select Task Products';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( Viewer.get() && this.task );

	}

	async execute() {

		const viewer = Viewer.get();
		const { outputs, inputs } = Sequence.taskProducts( this.task, { recursive: true } );
		const guids = [ ...new Set( [ ...outputs, ...inputs ] ) ];
		const ids = await Viewer.objectIds( this.model, guids );
		viewer.setSelection( ids );
		if ( ids.length && this.options.isolate ) {

			viewer.isolateSelected();
			this.context.signals.visibilityChanged.dispatch( { action: 'isolate', target: ids } );

		}

		if ( ids.length && ( this.options.frame || this.options.isolate ) ) viewer.frameSelection();
		return { status: 'FINISHED', result: { ids, products: guids.length, outputs: outputs.length, inputs: inputs.length } };

	}

}

// AUTHORING: WORK SCHEDULES

class SequenceAddWorkSchedule extends SequenceOperator {

	static operatorName = 'Sequence.AddWorkSchedule';
	static operatorLabel = 'Add Work Schedule';
	static operatorArgs = [ OPTIONS ];

	get model() {

		return this.options.model ?? this.state.model ?? store.models.find( ( entry ) => entry.file )?.id ?? null;

	}

	poll() {

		return Boolean( this.file );

	}

	execute() {

		const { name = 'Work schedule', predefinedType = 'PLANNED' } = this.options;
		const schedule = Sequence.addWorkSchedule( this.file, { name, predefinedType } );
		this.activate( { model: this.model, schedule: schedule.id(), task: 0 } );
		this.changed();
		return { status: 'FINISHED', result: schedule.id() };

	}

}

class SequenceEditWorkSchedule extends SequenceOperator {

	static operatorName = 'Sequence.EditWorkSchedule';
	static operatorLabel = 'Edit Work Schedule';
	static operatorArgs = [ ATTRIBUTES, OPTIONS ];

	constructor( context, attributes, options ) {

		super( context, options );
		this.attributes = attributes ?? {};

	}

	poll() {

		return Boolean( this.schedule );

	}

	execute() {

		Sequence.editWorkSchedule( this.file, this.schedule, this.attributes );
		this.changed();
		return { status: 'FINISHED' };

	}

}

class SequenceRemoveWorkSchedule extends SequenceOperator {

	static operatorName = 'Sequence.RemoveWorkSchedule';
	static operatorLabel = 'Remove Work Schedule';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.schedule );

	}

	execute() {

		const id = this.schedule.id();
		Sequence.removeWorkSchedule( this.file, this.schedule );
		if ( this.state.schedule === id ) this.activate( { schedule: 0, task: 0 } );
		this.changed();
		return { status: 'FINISHED' };

	}

}

// AUTHORING: TASKS

// Where the new task goes: options.parent (a task id); else options
// .placement 'child' (under the active task) or 'sibling' (the default:
// next to the active task, under its parent); a root task of the schedule
// when there is no parent.
class SequenceAddTask extends SequenceOperator {

	static operatorName = 'Sequence.AddTask';
	static operatorLabel = 'Add Task';
	static operatorArgs = [ OPTIONS ];

	get parent() {

		if ( this.options.parent ) return Ifc.byId( this.model, this.options.parent, 'IfcTask' );
		const active = this.task;
		if ( ! active ) return null;
		if ( this.options.placement === 'child' ) return active;
		const parent = active.Nests?.[ 0 ]?.RelatingObject;
		return parent?.isA( 'IfcTask' ) ? parent : null;

	}

	poll() {

		return Boolean( this.options.parent ? this.parent : this.parent || this.schedule );

	}

	execute() {

		const { name = 'New task', identification = null } = this.options;
		const parentTask = this.parent;
		const task = Sequence.addTask( this.file, { workSchedule: parentTask ? null : this.schedule, parentTask, name, identification } );
		this.activate( { task: task.id() } );
		this.changed();
		return { status: 'FINISHED', result: task.id() };

	}

}

class SequenceEditTask extends SequenceOperator {

	static operatorName = 'Sequence.EditTask';
	static operatorLabel = 'Edit Task';
	static operatorArgs = [ ATTRIBUTES, OPTIONS ];

	constructor( context, attributes, options ) {

		super( context, options );
		this.attributes = attributes ?? {};

	}

	poll() {

		return Boolean( this.task );

	}

	execute() {

		Sequence.editTask( this.file, this.task, this.attributes );
		this.changed();
		return { status: 'FINISHED' };

	}

}

class SequenceRemoveTask extends SequenceOperator {

	static operatorName = 'Sequence.RemoveTask';
	static operatorLabel = 'Remove Task';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.task );

	}

	execute() {

		const task = this.task;
		const id = task.id();
		const parent = task.Nests?.[ 0 ]?.RelatingObject;
		Sequence.removeTask( this.file, task );
		if ( this.state.task === id ) this.activate( { task: parent?.isA( 'IfcTask' ) ? parent.id() : 0 } );
		this.changed();
		return { status: 'FINISHED' };

	}

}

// ScheduleStart / ScheduleFinish / ScheduleDuration and the rest of
// IfcTaskTime. Like Bonsai, a task without a task time gets one first.
class SequenceEditTaskTime extends SequenceOperator {

	static operatorName = 'Sequence.EditTaskTime';
	static operatorLabel = 'Edit Task Time';
	static operatorArgs = [ ATTRIBUTES, OPTIONS ];

	constructor( context, attributes, options ) {

		super( context, options );
		this.attributes = attributes ?? {};

	}

	poll() {

		return Boolean( this.task );

	}

	execute() {

		const task = this.task;
		const taskTime = task.TaskTime ?? Sequence.addTaskTime( this.file, task );
		Sequence.editTaskTime( this.file, taskTime, this.attributes );
		this.changed();
		return { status: 'FINISHED' };

	}

}

// Assign products to the task: options.kind 'outputs' (it builds them,
// the default) or 'inputs' (it uses them). options.guids, else the
// viewport selection in the task's model. The result is how many products
// were found.
class SequenceAssignProducts extends SequenceOperator {

	static operatorName = 'Sequence.AssignProducts';
	static operatorLabel = 'Assign Selection to Task';
	static operatorArgs = [ OPTIONS ];
	static assign = true;

	poll() {

		return Boolean( this.task );

	}

	async execute() {

		const guids = this.options.guids ?? await Viewer.selectedGuids( this.model );
		const assign = this.constructor.assign;
		const inputs = this.options.kind === 'inputs';
		const task = this.task;
		let count = 0;
		for ( const guid of new Set( guids ) ) {

			const product = Ifc.byGuid( this.model, guid );
			if ( ! product?.isA( 'IfcProduct' ) ) continue;
			count ++;
			if ( inputs && assign ) Sequence.assignInput( this.file, task, product );
			else if ( inputs ) Sequence.unassignInput( this.file, task, product );
			else if ( assign ) Sequence.assignOutput( this.file, task, product );
			else Sequence.unassignOutput( this.file, task, product );

		}

		if ( count ) this.changed();
		return { status: 'FINISHED', result: count };

	}

}

class SequenceUnassignProducts extends SequenceAssignProducts {

	static operatorName = 'Sequence.UnassignProducts';
	static operatorLabel = 'Unassign Selection from Task';
	static assign = false;

}

// AUTHORING: SEQUENCE LINKS

// `predecessor` (a task id) comes before the task.
class SequenceAssignPredecessor extends SequenceOperator {

	static operatorName = 'Sequence.AssignPredecessor';
	static operatorLabel = 'Assign Predecessor';
	static operatorArgs = [ { name: 'predecessor', type: 'number' }, OPTIONS ];

	constructor( context, predecessor, options ) {

		super( context, options );
		this.predecessorId = predecessor;

	}

	get predecessor() {

		return Ifc.byId( this.model, this.predecessorId, 'IfcTask' );

	}

	poll() {

		return Boolean( this.task && this.predecessor );

	}

	execute() {

		const task = this.task;
		const predecessor = this.predecessor;
		if ( task.id() === predecessor.id() ) return { status: 'CANCELLED', message: 'A task cannot precede itself.' };
		Sequence.assignSequence( this.file, predecessor, task, this.options.sequenceType ?? 'FINISH_START' );
		this.changed();
		return { status: 'FINISHED' };

	}

}

class SequenceUnassignPredecessor extends SequenceAssignPredecessor {

	static operatorName = 'Sequence.UnassignPredecessor';
	static operatorLabel = 'Unassign Predecessor';

	execute() {

		Sequence.unassignSequence( this.file, this.predecessor, this.task );
		this.changed();
		return { status: 'FINISHED' };

	}

}

export {
	SequenceActivate,
	SequenceAddTask,
	SequenceAddWorkSchedule,
	SequenceAssignPredecessor,
	SequenceAssignProducts,
	SequenceEditTask,
	SequenceEditTaskTime,
	SequenceEditWorkSchedule,
	SequenceProductTasks,
	SequenceRemoveTask,
	SequenceRemoveWorkSchedule,
	SequenceSchedules,
	SequenceSelectTask,
	SequenceSelectedProducts,
	SequenceTaskDetails,
	SequenceTasks,
	SequenceToggle,
	SequenceToggleTasks,
	SequenceUnassignPredecessor,
	SequenceUnassignProducts,
};

export default [
	SequenceToggle,
	SequenceToggleTasks,
	SequenceActivate,
	SequenceSchedules,
	SequenceTasks,
	SequenceTaskDetails,
	SequenceProductTasks,
	SequenceSelectTask,
	SequenceSelectedProducts,
	SequenceAddWorkSchedule,
	SequenceEditWorkSchedule,
	SequenceRemoveWorkSchedule,
	SequenceAddTask,
	SequenceEditTask,
	SequenceRemoveTask,
	SequenceEditTaskTime,
	SequenceAssignProducts,
	SequenceUnassignProducts,
	SequenceAssignPredecessor,
	SequenceUnassignPredecessor,
];
