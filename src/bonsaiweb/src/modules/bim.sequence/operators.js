// This file was generated with the assistance of an AI coding tool.

import { Operator } from '../../ops.js';
import { Sequence } from '../../tool/Sequence.js';
import { Viewer } from '../../tool/Viewer.js';

// Viewer objectIds of the given GlobalIds in one model. The element table
// is fetched once per session by getObjects(), so later calls are cheap.
async function objectIds( viewer, modelId, guids ) {

	if ( ! guids.length ) return [];
	const want = new Set( guids );
	const objects = await viewer.getObjects();
	return objects
		.filter( ( object ) => object.sourceId === modelId && want.has( object.guid ) )
		.map( ( object ) => object.objectId );

}

class SequenceToggle extends Operator {

	static operatorName = 'Sequence.Toggle';
	static operatorLabel = 'Toggle Work Schedule';

	poll() {

		return Boolean( this.context.sequence?.panel );

	}

	execute() {

		this.context.sequence.panel.toggle();
		return { status: 'FINISHED' };

	}

}

class SequenceToggleTasks extends Operator {

	static operatorName = 'Sequence.ToggleTasks';
	static operatorLabel = 'Toggle Element Tasks';

	poll() {

		return Boolean( this.context.sequence?.tasksPanel );

	}

	execute() {

		this.context.sequence.tasksPanel.toggle();
		return { status: 'FINISHED' };

	}

}

class SequenceSchedules extends Operator {

	static operatorName = 'Sequence.Schedules';
	static operatorLabel = 'Work Schedules';

	async execute() {

		return { status: 'FINISHED', result: await Sequence.schedules() };

	}

}

class SequenceTasks extends Operator {

	static operatorName = 'Sequence.Tasks';
	static operatorLabel = 'Work Schedule Tasks';
	static operatorArgs = [ { name: 'modelId', type: 'number' }, { name: 'scheduleId', type: 'number' } ];

	constructor( context, modelId, scheduleId ) {

		super( context );
		this.modelId = modelId;
		this.scheduleId = scheduleId;

	}

	poll() {

		return Number.isInteger( this.modelId ) && Number.isInteger( this.scheduleId );

	}

	async execute() {

		return { status: 'FINISHED', result: await Sequence.tasks( this.modelId, this.scheduleId ) };

	}

}

class SequenceProductTasks extends Operator {

	static operatorName = 'Sequence.ProductTasks';
	static operatorLabel = 'Tasks for Selection';

	constructor( context, pick ) {

		super( context );
		this.pick = pick === undefined ? context.activeObject : pick;

	}

	async execute() {

		const { guid, sourceId } = this.pick ?? {};
		if ( ! guid || sourceId == null ) return { status: 'FINISHED', result: { outputs: [], inputs: [] } };
		return { status: 'FINISHED', result: await Sequence.productTasks( sourceId, guid ) };

	}

}

// Select what a task builds and uses; with `isolate`, hide everything else.
// A summary task selects the products of all its subtasks.
class SequenceSelectTask extends Operator {

	static operatorName = 'Sequence.SelectTask';
	static operatorLabel = 'Select Task Products';
	static operatorArgs = [
		{ name: 'modelId', type: 'number' },
		{ name: 'taskId', type: 'number' },
		{ name: 'options', type: 'object' },
	];

	constructor( context, modelId, taskId, { isolate = false, frame = false } = {} ) {

		super( context );
		this.modelId = modelId;
		this.taskId = taskId;
		this.isolate = isolate;
		this.frame = frame;

	}

	poll() {

		return Boolean( Viewer.get() ) && Number.isInteger( this.modelId ) && Number.isInteger( this.taskId );

	}

	async execute() {

		const viewer = Viewer.get();
		const { outputs, inputs } = await Sequence.taskProducts( this.modelId, this.taskId, { recursive: true } );
		// The viewer can draw one product as several objects with its GlobalId.
		const guids = [ ...new Set( [ ...outputs, ...inputs ] ) ];
		const ids = await objectIds( viewer, this.modelId, guids );
		viewer.setSelection( ids );
		if ( ids.length && this.isolate ) {

			viewer.isolateSelected();
			this.context.signals.visibilityChanged.dispatch( { action: 'isolate', target: ids } );

		}

		if ( ids.length && ( this.frame || this.isolate ) ) viewer.frameSelection();
		return { status: 'FINISHED', result: { ids, products: guids.length, outputs: outputs.length, inputs: inputs.length } };

	}

}

export { SequenceProductTasks, SequenceSchedules, SequenceSelectTask, SequenceTasks, SequenceToggle, SequenceToggleTasks };
export default [ SequenceToggle, SequenceToggleTasks, SequenceSchedules, SequenceTasks, SequenceProductTasks, SequenceSelectTask ];
