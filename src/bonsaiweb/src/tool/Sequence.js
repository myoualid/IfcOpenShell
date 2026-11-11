// This file was generated with the assistance of an AI coding tool.
//
// bonsai.tool.Sequence — work schedules and tasks of the live IFC files.
// The graph walks are ifcopenshell.util.sequence, transpiled into the local
// ifcopenshell build. This tool shapes their results into plain rows for the
// planning panels, mirroring bonsai.tool.Sequence in Python.

// 'ifcopenshell/util/*' is imported where it is used, never at the top, for
// the same reason as 'ifcopenshell' in tool/Ifc.js.
import { store } from '../context/store.js';

let modules = null;

function load() {

	modules ??= Promise.all( [
		import( 'ifcopenshell/util/sequence' ),
		import( 'ifcopenshell/util/date' ),
	] ).then( ( [ sequence, date ] ) => ( { sequence, date } ) );
	return modules;

}

function iso( value ) {

	return value ? value.isoformat() : null;

}

function text( value ) {

	return value == null ? '' : String( value );

}

function fileOf( modelId ) {

	return store.models.find( ( entry ) => entry.id === modelId )?.file ?? null;

}

function byId( file, id ) {

	try {

		return file.byId( id );

	} catch {

		return null;

	}

}

function byGuid( file, guid ) {

	try {

		return file.byGuid( guid );

	} catch {

		return null;

	}

}

function taskRef( sequence, task ) {

	const schedule = sequence.getTaskWorkSchedule( task );
	return {
		id: task.id(),
		name: text( task.Name ) || 'Unnamed',
		identification: text( task.Identification ),
		scheduleId: schedule ? schedule.id() : null,
		schedule: text( schedule?.Name ),
	};

}

export class Sequence {

	// Every IfcWorkSchedule in every model with a live file.
	// [{ modelId, modelName, id, name, predefinedType, taskCount }]
	static async schedules() {

		const { sequence } = await load();
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
					taskCount: sequence.getWorkScheduleTasks( schedule ).length,
				} );

			}

		}

		return result;

	}

	// The task tree of one schedule, depth first, one plain row per task.
	// start / finish are ISO strings: the task's own schedule dates, or for a
	// summary task the earliest start and latest finish of its subtasks
	// (util.sequence.derive_date). `derived` marks the second case.
	static async tasks( modelId, scheduleId ) {

		const file = fileOf( modelId );
		const schedule = file ? byId( file, scheduleId ) : null;
		if ( ! schedule || ! schedule.isA( 'IfcWorkSchedule' ) ) return [];

		const { sequence, date } = await load();
		const rows = [];

		const walk = ( task, parentId, depth ) => {

			const time = task.TaskTime;
			const nested = sequence.getNestedTasks( task );
			const ownStart = time?.ScheduleStart ?? null;
			const ownFinish = time?.ScheduleFinish ?? null;
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
				start: iso( sequence.deriveDate( task, 'ScheduleStart', { isEarliest: true } ) ),
				finish: iso( sequence.deriveDate( task, 'ScheduleFinish', { isLatest: true } ) ),
				derived: ! ownStart && ! ownFinish,
				duration: duration ? date.readableIfcDuration( duration ) : '',
				hasChildren: nested.length > 0,
				outputCount: sequence.getTaskOutputs( task ).size,
				inputCount: sequence.getTaskInputs( task ).size,
			} );
			for ( const child of nested ) walk( child, task.id(), depth + 1 );

		};

		for ( const root of sequence.getRootTasks( schedule ) ) walk( root, 0, 0 );
		return rows;

	}

	// GlobalIds of the products a task builds (outputs) and uses (inputs).
	// With `recursive`, its subtasks count too, as in Bonsai's summary rows.
	static async taskProducts( modelId, taskId, { recursive = false } = {} ) {

		const file = fileOf( modelId );
		const task = file ? byId( file, taskId ) : null;
		if ( ! task || ! task.isA( 'IfcTask' ) ) return { outputs: [], inputs: [] };

		const { sequence } = await load();
		const guids = ( products ) => [ ...products ].map( ( product ) => product.GlobalId ).filter( Boolean );
		return {
			outputs: guids( sequence.getTaskOutputs( task, { isRecursive: recursive } ) ),
			inputs: guids( sequence.getTaskInputs( task, { isRecursive: recursive } ) ),
		};

	}

	// Tasks that build (outputs) or use (inputs) one product.
	static async productTasks( modelId, guid ) {

		const file = fileOf( modelId );
		const product = file && guid ? byGuid( file, guid ) : null;
		if ( ! product ) return { outputs: [], inputs: [] };

		const { sequence } = await load();
		const [ inputs, outputs ] = sequence.getTasksForProduct( product );
		return {
			outputs: outputs.map( ( task ) => taskRef( sequence, task ) ),
			inputs: inputs.map( ( task ) => taskRef( sequence, task ) ),
		};

	}

}

export default Sequence;
