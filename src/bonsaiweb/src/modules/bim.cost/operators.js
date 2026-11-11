// This file was generated with the assistance of an AI coding tool.

import { Operator } from '../../ops.js';
import { Cost } from '../../tool/Cost.js';
import { Viewer } from '../../tool/Viewer.js';

// Viewer objectIds of the given GlobalIds in one model. The viewer can draw
// one product as several objects that share its GlobalId.
async function objectIds( viewer, modelId, guids ) {

	if ( ! guids.length ) return [];
	const want = new Set( guids );
	const objects = await viewer.getObjects();
	return objects
		.filter( ( object ) => object.sourceId === modelId && want.has( object.guid ) )
		.map( ( object ) => object.objectId );

}

class CostToggle extends Operator {

	static operatorName = 'Cost.Toggle';
	static operatorLabel = 'Toggle Cost Schedule';

	poll() {

		return Boolean( this.context.cost?.panel );

	}

	execute() {

		this.context.cost.panel.toggle();
		return { status: 'FINISHED' };

	}

}

class CostToggleElement extends Operator {

	static operatorName = 'Cost.ToggleElement';
	static operatorLabel = 'Toggle Element Cost';

	poll() {

		return Boolean( this.context.cost?.elementPanel );

	}

	execute() {

		this.context.cost.elementPanel.toggle();
		return { status: 'FINISHED' };

	}

}

class CostSchedules extends Operator {

	static operatorName = 'Cost.Schedules';
	static operatorLabel = 'Cost Schedules';

	async execute() {

		return { status: 'FINISHED', result: await Cost.schedules() };

	}

}

class CostItems extends Operator {

	static operatorName = 'Cost.Items';
	static operatorLabel = 'Cost Schedule Items';
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

		return { status: 'FINISHED', result: await Cost.items( this.modelId, this.scheduleId ) };

	}

}

class CostProductItems extends Operator {

	static operatorName = 'Cost.ProductItems';
	static operatorLabel = 'Cost Items for Selection';

	constructor( context, pick ) {

		super( context );
		this.pick = pick === undefined ? context.activeObject : pick;

	}

	async execute() {

		const { guid, sourceId } = this.pick ?? {};
		if ( ! guid || sourceId == null ) return { status: 'FINISHED', result: [] };
		return { status: 'FINISHED', result: await Cost.productItems( sourceId, guid ) };

	}

}

// Select the elements a cost item prices, with those of its nested items;
// with `isolate`, hide everything else.
class CostSelectItem extends Operator {

	static operatorName = 'Cost.SelectItem';
	static operatorLabel = 'Select Cost Item Elements';
	static operatorArgs = [
		{ name: 'modelId', type: 'number' },
		{ name: 'itemId', type: 'number' },
		{ name: 'options', type: 'object' },
	];

	constructor( context, modelId, itemId, { isolate = false, frame = false } = {} ) {

		super( context );
		this.modelId = modelId;
		this.itemId = itemId;
		this.isolate = isolate;
		this.frame = frame;

	}

	poll() {

		return Boolean( Viewer.get() ) && Number.isInteger( this.modelId ) && Number.isInteger( this.itemId );

	}

	async execute() {

		const viewer = Viewer.get();
		const guids = await Cost.itemProducts( this.modelId, this.itemId, { deep: true } );
		const ids = await objectIds( viewer, this.modelId, guids );
		viewer.setSelection( ids );
		if ( ids.length && this.isolate ) {

			viewer.isolateSelected();
			this.context.signals.visibilityChanged.dispatch( { action: 'isolate', target: ids } );

		}

		if ( ids.length && ( this.frame || this.isolate ) ) viewer.frameSelection();
		return { status: 'FINISHED', result: { ids, products: guids.length } };

	}

}

export { CostItems, CostProductItems, CostSchedules, CostSelectItem, CostToggle, CostToggleElement };
export default [ CostToggle, CostToggleElement, CostSchedules, CostItems, CostProductItems, CostSelectItem ];
