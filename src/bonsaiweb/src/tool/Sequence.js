// This file was generated with the assistance of an AI coding tool.
//
// bonsai.tool.Sequence — work schedules and tasks of the live IFC files,
// mirroring bonsai.tool.Sequence in Python. Reads go through
// ifcopenshell.util.sequence and writes through ifcopenshell.api.sequence,
// both transpiled into the local ifcopenshell build. Each method does one
// thing on entities it is given; the Sequence.* operators find those
// entities with tool.Ifc and combine the steps, as Bonsai's core does.

import * as SequenceAPI from 'ifcopenshell/api/sequence';
import * as DateUtil from 'ifcopenshell/util/date';
import * as SequenceUtil from 'ifcopenshell/util/sequence';

import { store } from '../context/store.js';

function text( value ) {

	return value == null ? '' : String( value );

}

function iso( value ) {

	return value ? value.isoformat() : null;

}

export class Sequence {

	// READ

	// Every IfcWorkSchedule in every model with a live file.
	// [{ modelId, modelName, id, name, predefinedType, taskCount }]
	static schedules() {

		const result = [];
		for ( const entry of store.models ) {

			if ( ! entry.file ) continue;
			for ( const schedule of entry.file.byType( 'IfcWorkSchedule' ) ) {

				result.push( {
					modelId: entry.id,
					modelName: entry.name,
					id: schedule.id(),
					name: text( schedule.Name ) || `Schedule #${ schedule.id() }`,
					predefinedType: text( schedule.PredefinedType ),
					taskCount: SequenceUtil.getWorkScheduleTasks( schedule ).length,
				} );

			}

		}

		return result;

	}

	// The task tree of a schedule, depth first, one plain row per task.
	// start / finish are ISO strings: the task's own schedule dates, or for a
	// summary task the earliest start and latest finish of its subtasks
	// (util.sequence.derive_date). `derived` marks the second case.
	static taskRows( schedule ) {

		const rows = [];
		const walk = ( task, parentId, depth ) => {

			const time = task.TaskTime;
			const nested = SequenceUtil.getNestedTasks( task );
			const duration = time?.ScheduleDuration ?? null;
			rows.push( {
				id: task.id(),
				parentId,
				depth,
				name: text( task.Name ) || 'Unnamed',
				identification: text( task.Identification ),
				status: text( task.Status ),
				predefinedType: text( task.PredefinedType ),
				isMilestone: task.IsMilestone === true,
				isCritical: time?.IsCritical === true,
				completion: typeof time?.Completion === 'number' ? time.Completion : null,
				start: iso( SequenceUtil.deriveDate( task, 'ScheduleStart', { isEarliest: true } ) ),
				finish: iso( SequenceUtil.deriveDate( task, 'ScheduleFinish', { isLatest: true } ) ),
				derived: ! time?.ScheduleStart && ! time?.ScheduleFinish,
				duration: duration ? DateUtil.readableIfcDuration( duration ) : '',
				hasChildren: nested.length > 0,
				outputCount: SequenceUtil.getTaskOutputs( task ).size,
				inputCount: SequenceUtil.getTaskInputs( task ).size,
			} );
			for ( const child of nested ) walk( child, task.id(), depth + 1 );

		};

		for ( const root of SequenceUtil.getRootTasks( schedule ) ) walk( root, 0, 0 );
		return rows;

	}

	// GlobalIds of the products a task builds (outputs) and uses (inputs).
	// With `recursive`, its subtasks count too, as in Bonsai's summary rows.
	static taskProducts( task, { recursive = false } = {} ) {

		const guids = ( products ) => [ ...products ].map( ( product ) => product.GlobalId ).filter( Boolean );
		return {
			outputs: guids( SequenceUtil.getTaskOutputs( task, { isRecursive: recursive } ) ),
			inputs: guids( SequenceUtil.getTaskInputs( task, { isRecursive: recursive } ) ),
		};

	}

	static taskRef( task ) {

		const schedule = SequenceUtil.getTaskWorkSchedule( task );
		return {
			id: task.id(),
			name: text( task.Name ) || 'Unnamed',
			identification: text( task.Identification ),
			scheduleId: schedule ? schedule.id() : null,
			schedule: text( schedule?.Name ),
		};

	}

	// Tasks that build (outputs) or use (inputs) one product.
	static productTasks( product ) {

		const [ inputs, outputs ] = SequenceUtil.getTasksForProduct( product );
		return { outputs: outputs.map( Sequence.taskRef ), inputs: inputs.map( Sequence.taskRef ) };

	}

	// What the task editor shows: attributes, schedule times, predecessors,
	// successors, and the elements the task builds and uses.
	static taskDetails( task ) {

		const time = task.TaskTime;
		const link = ( rel, process ) => ( {
			id: process.id(),
			name: text( process.Name ) || 'Unnamed',
			identification: text( process.Identification ),
			sequenceType: text( rel.SequenceType ),
		} );
		const products = ( set ) => [ ...set ].map( ( product ) => ( {
			guid: text( product.GlobalId ),
			name: text( product.Name ),
			type: product.isA(),
		} ) );
		return {
			id: task.id(),
			name: text( task.Name ),
			identification: text( task.Identification ),
			description: text( task.Description ),
			status: text( task.Status ),
			predefinedType: text( task.PredefinedType ),
			isMilestone: task.IsMilestone === true,
			time: time ? {
				scheduleStart: text( time.ScheduleStart ),
				scheduleFinish: text( time.ScheduleFinish ),
				scheduleDuration: text( time.ScheduleDuration ),
				isCritical: time.IsCritical === true,
			} : null,
			predecessors: ( task.IsSuccessorFrom ?? [] ).map( ( rel ) => link( rel, rel.RelatingProcess ) ),
			successors: ( task.IsPredecessorTo ?? [] ).map( ( rel ) => link( rel, rel.RelatedProcess ) ),
			outputs: products( SequenceUtil.getTaskOutputs( task ) ),
			inputs: products( SequenceUtil.getTaskInputs( task ) ),
			hasChildren: SequenceUtil.getNestedTasks( task ).length > 0,
		};

	}

	// WRITE — ifcopenshell.api.sequence on a live file. ifcopenshell-js has
	// no transactions, so none of this can be undone.

	static addWorkSchedule( file, { name, predefinedType } ) {

		return SequenceAPI.addWorkSchedule( file, { name, predefinedType } );

	}

	static editWorkSchedule( file, schedule, attributes ) {

		SequenceAPI.editWorkSchedule( file, schedule, attributes );

	}

	static removeWorkSchedule( file, schedule ) {

		SequenceAPI.removeWorkSchedule( file, schedule );

	}

	// A root task of `workSchedule`, or a subtask of `parentTask`.
	static addTask( file, { workSchedule = null, parentTask = null, name, identification = null } ) {

		const options = { name };
		if ( parentTask ) options.parentTask = parentTask;
		else options.workSchedule = workSchedule;
		if ( identification ) options.identification = identification;
		return SequenceAPI.addTask( file, options );

	}

	static editTask( file, task, attributes ) {

		SequenceAPI.editTask( file, task, attributes );

	}

	static removeTask( file, task ) {

		SequenceAPI.removeTask( file, task );

	}

	static addTaskTime( file, task ) {

		return SequenceAPI.addTaskTime( file, task );

	}

	// The API derives the missing date or duration, and moves successors.
	static editTaskTime( file, taskTime, attributes ) {

		SequenceAPI.editTaskTime( file, taskTime, attributes );

	}

	// The task builds the product (IfcRelAssignsToProduct).
	static assignOutput( file, task, product ) {

		SequenceAPI.assignProduct( file, product, task );

	}

	static unassignOutput( file, task, product ) {

		SequenceAPI.unassignProduct( file, product, task );

	}

	// The task uses the product (IfcRelAssignsToProcess).
	static assignInput( file, task, product ) {

		SequenceAPI.assignProcess( file, task, product );

	}

	static unassignInput( file, task, product ) {

		SequenceAPI.unassignProcess( file, task, product );

	}

	// `predecessor` comes before `successor` (IfcRelSequence).
	static assignSequence( file, predecessor, successor, sequenceType = 'FINISH_START' ) {

		return SequenceAPI.assignSequence( file, predecessor, successor, { sequenceType } );

	}

	static unassignSequence( file, predecessor, successor ) {

		SequenceAPI.unassignSequence( file, predecessor, successor );

	}

}

export default Sequence;
