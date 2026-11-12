// This file was generated with the assistance of an AI coding tool.
//
// Cost.* operators. The active model, cost schedule and cost item are
// context.cost.model, .schedule and .item (STEP ids); every operator works
// on them unless its options name others. Operators that change that state
// dispatch scheduleActivated; operators that change the IFC file dispatch
// scheduleChanged; panel toggles dispatch panelToggled. Panels only listen.
// Authoring operators carry the logic of Bonsai's core/cost.py and call
// tool.Cost for each step. They are not undoable: the IFC file has no
// transactions.

import { Operator } from '../../ops.js';
import { store } from '../../context/store.js';
import { Cost } from '../../tool/Cost.js';
import { Ifc } from '../../tool/Ifc.js';
import { Viewer } from '../../tool/Viewer.js';

const OPTIONS = { name: 'options', type: 'object', optional: true };
const ATTRIBUTES = { name: 'attributes', type: 'object' };

const QUANTITY_CLASSES = [
	'IfcQuantityCount', 'IfcQuantityNumber', 'IfcQuantityLength', 'IfcQuantityArea',
	'IfcQuantityVolume', 'IfcQuantityWeight', 'IfcQuantityTime',
];

// Resolves what an operator acts on: options.model / .schedule / .item when
// given, else the active ones on context.cost.
class CostOperator extends Operator {

	constructor( context, options = {} ) {

		super( context );
		this.options = options ?? {};

	}

	get state() {

		return this.context.cost ?? {};

	}

	get model() {

		return this.options.model ?? this.state.model ?? null;

	}

	get file() {

		return Ifc.get( this.model );

	}

	get schedule() {

		return Ifc.byId( this.model, this.options.schedule ?? this.state.schedule, 'IfcCostSchedule' );

	}

	get item() {

		return Ifc.byId( this.model, this.options.item ?? this.state.item, 'IfcCostItem' );

	}

	// Move the active state and tell the panels.
	activate( changes ) {

		this.context.cost ??= {};
		Object.assign( this.context.cost, changes );
		this.context.signals.scheduleActivated.dispatch( { module: 'cost' } );

	}

	changed() {

		this.context.signals.scheduleChanged.dispatch( { module: 'cost', modelId: this.model } );

	}

}

// Operators on one entity of the active item, named by its STEP id: a cost
// value or a quantity.
class CostPartOperator extends CostOperator {

	static partClass = '';

	constructor( context, part, ...rest ) {

		super( context, rest.at( - 1 ) );
		this.partId = part;

	}

	get part() {

		return Ifc.byId( this.model, this.partId, this.constructor.partClass );

	}

	poll() {

		return Boolean( this.item && this.part );

	}

}

// PANELS

class CostToggle extends Operator {

	static operatorName = 'Cost.Toggle';
	static operatorLabel = 'Toggle Cost Schedule';

	execute() {

		this.context.signals.panelToggled.dispatch( { id: 'cost-panel' } );
		return { status: 'FINISHED' };

	}

}

class CostToggleElement extends Operator {

	static operatorName = 'Cost.ToggleElement';
	static operatorLabel = 'Toggle Element Cost';

	execute() {

		this.context.signals.panelToggled.dispatch( { id: 'cost-element-panel' } );
		return { status: 'FINISHED' };

	}

}

class CostToggleEditor extends Operator {

	static operatorName = 'Cost.ToggleEditor';
	static operatorLabel = 'Toggle Cost Item Editor';

	execute() {

		this.context.signals.panelToggled.dispatch( { id: 'cost-editor-panel' } );
		return { status: 'FINISHED' };

	}

}

// STATE

// Make a model, cost schedule and cost item active: options.model,
// .schedule, .item (an item of 0 clears it). With options.show, also show
// the cost sheet.
class CostActivate extends CostOperator {

	static operatorName = 'Cost.Activate';
	static operatorLabel = 'Activate Cost Schedule or Item';
	static operatorArgs = [ OPTIONS ];

	execute() {

		const changes = {};
		for ( const key of [ 'model', 'schedule', 'item' ] ) {

			if ( this.options[ key ] !== undefined ) changes[ key ] = this.options[ key ];

		}

		this.activate( changes );
		if ( this.options.show ) this.context.signals.panelToggled.dispatch( { id: 'cost-panel', show: true } );
		return { status: 'FINISHED' };

	}

}

// READ

class CostSchedules extends Operator {

	static operatorName = 'Cost.Schedules';
	static operatorLabel = 'Cost Schedules';

	execute() {

		return { status: 'FINISHED', result: Cost.schedules() };

	}

}

class CostItems extends CostOperator {

	static operatorName = 'Cost.Items';
	static operatorLabel = 'Cost Schedule Items';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.schedule );

	}

	execute() {

		return { status: 'FINISHED', result: Cost.itemRows( this.file, this.schedule ) };

	}

}

class CostItemDetails extends CostOperator {

	static operatorName = 'Cost.ItemDetails';
	static operatorLabel = 'Cost Item Details';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.item );

	}

	execute() {

		return { status: 'FINISHED', result: Cost.itemDetails( this.file, this.item ) };

	}

}

class CostRateItems extends CostOperator {

	static operatorName = 'Cost.RateItems';
	static operatorLabel = 'Schedule of Rates Items';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.file );

	}

	execute() {

		return { status: 'FINISHED', result: Cost.rateItems( this.file ) };

	}

}

class CostProductItems extends Operator {

	static operatorName = 'Cost.ProductItems';
	static operatorLabel = 'Cost Items for Selection';

	constructor( context, pick ) {

		super( context );
		this.pick = pick === undefined ? context.activeObject : pick;

	}

	execute() {

		const product = Ifc.byGuid( this.pick?.sourceId, this.pick?.guid );
		const result = product ? Cost.productItems( Ifc.get( this.pick.sourceId ), product ) : [];
		return { status: 'FINISHED', result };

	}

}

// Select the elements a cost item prices, with those of its nested items;
// with options.isolate, hide everything else.
class CostSelectItem extends CostOperator {

	static operatorName = 'Cost.SelectItem';
	static operatorLabel = 'Select Cost Item Elements';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( Viewer.get() && this.item );

	}

	async execute() {

		const viewer = Viewer.get();
		const guids = Cost.itemProducts( this.item, { deep: true } );
		const ids = await Viewer.objectIds( this.model, guids );
		viewer.setSelection( ids );
		if ( ids.length && this.options.isolate ) {

			viewer.isolateSelected();
			this.context.signals.visibilityChanged.dispatch( { action: 'isolate', target: ids } );

		}

		if ( ids.length && ( this.options.frame || this.options.isolate ) ) viewer.frameSelection();
		return { status: 'FINISHED', result: { ids, products: guids.length } };

	}

}

// AUTHORING: COST SCHEDULES

class CostAddCostSchedule extends CostOperator {

	static operatorName = 'Cost.AddCostSchedule';
	static operatorLabel = 'Add Cost Schedule';
	static operatorArgs = [ OPTIONS ];

	get model() {

		return this.options.model ?? this.state.model ?? store.models.find( ( entry ) => entry.file )?.id ?? null;

	}

	poll() {

		return Boolean( this.file );

	}

	execute() {

		const { name = 'Cost schedule', predefinedType = 'COSTPLAN' } = this.options;
		const schedule = Cost.addCostSchedule( this.file, { name, predefinedType } );
		this.activate( { model: this.model, schedule: schedule.id(), item: 0 } );
		this.changed();
		return { status: 'FINISHED', result: schedule.id() };

	}

}

class CostEditCostSchedule extends CostOperator {

	static operatorName = 'Cost.EditCostSchedule';
	static operatorLabel = 'Edit Cost Schedule';
	static operatorArgs = [ ATTRIBUTES, OPTIONS ];

	constructor( context, attributes, options ) {

		super( context, options );
		this.attributes = attributes ?? {};

	}

	poll() {

		return Boolean( this.schedule );

	}

	execute() {

		Cost.editCostSchedule( this.file, this.schedule, this.attributes );
		this.changed();
		return { status: 'FINISHED' };

	}

}

class CostRemoveCostSchedule extends CostOperator {

	static operatorName = 'Cost.RemoveCostSchedule';
	static operatorLabel = 'Remove Cost Schedule';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.schedule );

	}

	execute() {

		const id = this.schedule.id();
		Cost.removeCostSchedule( this.file, this.schedule );
		if ( this.state.schedule === id ) this.activate( { schedule: 0, item: 0 } );
		this.changed();
		return { status: 'FINISHED' };

	}

}

// AUTHORING: COST ITEMS

// Where the new item goes: options.parent (an item id); else options
// .placement 'child' (under the active item) or 'sibling' (the default:
// next to the active item, under its parent); a root item of the schedule
// when there is no parent.
class CostAddCostItem extends CostOperator {

	static operatorName = 'Cost.AddCostItem';
	static operatorLabel = 'Add Cost Item';
	static operatorArgs = [ OPTIONS ];

	get parent() {

		if ( this.options.parent ) return Ifc.byId( this.model, this.options.parent, 'IfcCostItem' );
		const active = this.item;
		if ( ! active ) return null;
		if ( this.options.placement === 'child' ) return active;
		const parent = active.Nests?.[ 0 ]?.RelatingObject;
		return parent?.isA( 'IfcCostItem' ) ? parent : null;

	}

	poll() {

		return Boolean( this.options.parent ? this.parent : this.parent || this.schedule );

	}

	execute() {

		const parent = this.parent;
		const item = Cost.addCostItem( this.file, { costSchedule: parent ? null : this.schedule, costItem: parent } );
		const { name = 'New item', identification = null } = this.options;
		const attributes = { Name: name };
		if ( identification ) attributes.Identification = identification;
		Cost.editCostItem( this.file, item, attributes );
		this.activate( { item: item.id() } );
		this.changed();
		return { status: 'FINISHED', result: item.id() };

	}

}

class CostEditCostItem extends CostOperator {

	static operatorName = 'Cost.EditCostItem';
	static operatorLabel = 'Edit Cost Item';
	static operatorArgs = [ ATTRIBUTES, OPTIONS ];

	constructor( context, attributes, options ) {

		super( context, options );
		this.attributes = attributes ?? {};

	}

	poll() {

		return Boolean( this.item );

	}

	execute() {

		Cost.editCostItem( this.file, this.item, this.attributes );
		this.changed();
		return { status: 'FINISHED' };

	}

}

class CostRemoveCostItem extends CostOperator {

	static operatorName = 'Cost.RemoveCostItem';
	static operatorLabel = 'Remove Cost Item';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.item );

	}

	execute() {

		const item = this.item;
		const id = item.id();
		const parent = item.Nests?.[ 0 ]?.RelatingObject;
		Cost.removeCostItem( this.file, item );
		if ( this.state.item === id ) this.activate( { item: parent?.isA( 'IfcCostItem' ) ? parent.id() : 0 } );
		this.changed();
		return { status: 'FINISHED' };

	}

}

// AUTHORING: QUANTITIES

// options.ifcClass: IfcQuantityCount (the default), Number, Length, Area,
// Volume, Weight or Time. options.value sets it at once.
class CostAddQuantity extends CostOperator {

	static operatorName = 'Cost.AddQuantity';
	static operatorLabel = 'Add Cost Item Quantity';
	static operatorArgs = [ OPTIONS ];

	poll() {

		return Boolean( this.item ) && QUANTITY_CLASSES.includes( this.options.ifcClass ?? 'IfcQuantityCount' );

	}

	execute() {

		const quantity = Cost.addCostItemQuantity( this.file, this.item, this.options.ifcClass ?? 'IfcQuantityCount' );
		if ( Number.isFinite( this.options.value ) ) {

			Cost.editCostItemQuantity( this.file, quantity, { [ quantity.attributeName( 3 ) ]: this.options.value } );

		}

		this.changed();
		return { status: 'FINISHED', result: quantity.id() };

	}

}

// `quantity` is the STEP id of one of the active item's quantities.
class CostEditQuantity extends CostPartOperator {

	static operatorName = 'Cost.EditQuantity';
	static operatorLabel = 'Edit Cost Item Quantity';
	static operatorArgs = [ { name: 'quantity', type: 'number' }, { name: 'value', type: 'number' }, OPTIONS ];
	static partClass = 'IfcPhysicalQuantity';

	constructor( context, quantity, value, options ) {

		super( context, quantity, options );
		this.value = value;

	}

	poll() {

		return super.poll() && Number.isFinite( this.value );

	}

	execute() {

		const quantity = this.part;
		Cost.editCostItemQuantity( this.file, quantity, { [ quantity.attributeName( 3 ) ]: this.value } );
		this.changed();
		return { status: 'FINISHED' };

	}

}

class CostRemoveQuantity extends CostPartOperator {

	static operatorName = 'Cost.RemoveQuantity';
	static operatorLabel = 'Remove Cost Item Quantity';
	static operatorArgs = [ { name: 'quantity', type: 'number' }, OPTIONS ];
	static partClass = 'IfcPhysicalQuantity';

	execute() {

		Cost.removeCostItemQuantity( this.file, this.item, this.part );
		this.changed();
		return { status: 'FINISHED' };

	}

}

// AUTHORING: COST VALUES

// options.type: 'FIXED' (options.value, 0 by default), 'SUM' (adds up the
// nested items) or 'CATEGORY' (adds up nested values of options.category).
class CostAddValue extends CostOperator {

	static operatorName = 'Cost.AddValue';
	static operatorLabel = 'Add Cost Value';
	static operatorArgs = [ OPTIONS ];

	poll() {

		const type = this.options.type ?? 'FIXED';
		if ( type === 'CATEGORY' && ! this.options.category ) return false;
		return Boolean( this.item ) && [ 'FIXED', 'SUM', 'CATEGORY' ].includes( type );

	}

	execute() {

		const type = this.options.type ?? 'FIXED';
		let attributes = { AppliedValue: Number( this.options.value ?? 0 ) };
		if ( type === 'SUM' ) attributes = { Category: '*' };
		else if ( type === 'CATEGORY' ) attributes = { Category: this.options.category };
		const value = Cost.addCostValue( this.file, this.item );
		Cost.editCostValue( this.file, value, attributes );
		this.changed();
		return { status: 'FINISHED', result: value.id() };

	}

}

// `value` is the STEP id of one of the active item's cost values; the
// formula uses Bonsai's syntax, such as 120.5, SUM() or Labour()+Material()*1.2.
class CostEditValueFormula extends CostPartOperator {

	static operatorName = 'Cost.EditValueFormula';
	static operatorLabel = 'Edit Cost Value Formula';
	static operatorArgs = [ { name: 'value', type: 'number' }, { name: 'formula', type: 'string' }, OPTIONS ];
	static partClass = 'IfcCostValue';

	constructor( context, value, formula, options ) {

		super( context, value, options );
		this.formula = String( formula ?? '' );

	}

	execute() {

		try {

			Cost.parseFormula( this.formula );

		} catch ( error ) {

			return { status: 'CANCELLED', message: error.message };

		}

		Cost.editCostValueFormula( this.file, this.part, this.formula );
		this.changed();
		return { status: 'FINISHED' };

	}

}

class CostEditValue extends CostPartOperator {

	static operatorName = 'Cost.EditValue';
	static operatorLabel = 'Edit Cost Value';
	static operatorArgs = [ { name: 'value', type: 'number' }, ATTRIBUTES, OPTIONS ];
	static partClass = 'IfcCostValue';

	constructor( context, value, attributes, options ) {

		super( context, value, options );
		this.attributes = attributes ?? {};

	}

	execute() {

		Cost.editCostValue( this.file, this.part, this.attributes );
		this.changed();
		return { status: 'FINISHED' };

	}

}

class CostRemoveValue extends CostPartOperator {

	static operatorName = 'Cost.RemoveValue';
	static operatorLabel = 'Remove Cost Value';
	static operatorArgs = [ { name: 'value', type: 'number' }, OPTIONS ];
	static partClass = 'IfcCostValue';

	execute() {

		Cost.removeCostValue( this.file, this.item, this.part );
		this.changed();
		return { status: 'FINISHED' };

	}

}

// AUTHORING: RATES AND ELEMENTS

// Price the item from a rate (an item of a schedule of rates): copy its
// values and link the item to it, as Bonsai's core does.
class CostAssignRate extends CostOperator {

	static operatorName = 'Cost.AssignRate';
	static operatorLabel = 'Assign Cost Rate';
	static operatorArgs = [ { name: 'rate', type: 'number' }, OPTIONS ];

	constructor( context, rate, options ) {

		super( context, options );
		this.rateId = rate;

	}

	get rate() {

		return Ifc.byId( this.model, this.rateId, 'IfcCostItem' );

	}

	poll() {

		return Boolean( this.item && this.rate );

	}

	execute() {

		const item = this.item;
		const rate = this.rate;
		if ( item.id() === rate.id() ) return { status: 'CANCELLED', message: 'An item cannot be its own rate.' };
		Cost.assignCostValue( this.file, item, rate );
		const existing = Cost.assignedRate( item );
		if ( existing ) Cost.unassignControl( this.file, existing, [ item ] );
		Cost.assignControl( this.file, rate, [ item ] );
		this.changed();
		return { status: 'FINISHED' };

	}

}

// Assign elements to the item (IfcRelAssignsToControl): options.guids, else
// the viewport selection in the item's model. The result is how many
// elements were found.
class CostAssignProducts extends CostOperator {

	static operatorName = 'Cost.AssignProducts';
	static operatorLabel = 'Assign Selection to Cost Item';
	static operatorArgs = [ OPTIONS ];
	static assign = true;

	poll() {

		return Boolean( this.item );

	}

	async execute() {

		const guids = this.options.guids ?? await Viewer.selectedGuids( this.model );
		const products = [ ...new Set( guids ) ]
			.map( ( guid ) => Ifc.byGuid( this.model, guid ) )
			.filter( ( product ) => product?.isA( 'IfcProduct' ) );
		if ( products.length ) {

			if ( this.constructor.assign ) Cost.assignControl( this.file, this.item, products );
			else Cost.unassignControl( this.file, this.item, products );
			this.changed();

		}

		return { status: 'FINISHED', result: products.length };

	}

}

class CostUnassignProducts extends CostAssignProducts {

	static operatorName = 'Cost.UnassignProducts';
	static operatorLabel = 'Unassign Selection from Cost Item';
	static assign = false;

}

export {
	CostActivate,
	CostAddCostItem,
	CostAddCostSchedule,
	CostAddQuantity,
	CostAddValue,
	CostAssignProducts,
	CostAssignRate,
	CostEditCostItem,
	CostEditCostSchedule,
	CostEditQuantity,
	CostEditValue,
	CostEditValueFormula,
	CostItemDetails,
	CostItems,
	CostProductItems,
	CostRateItems,
	CostRemoveCostItem,
	CostRemoveCostSchedule,
	CostRemoveQuantity,
	CostRemoveValue,
	CostSchedules,
	CostSelectItem,
	CostToggle,
	CostToggleEditor,
	CostToggleElement,
	CostUnassignProducts,
};

export default [
	CostToggle,
	CostToggleElement,
	CostToggleEditor,
	CostActivate,
	CostSchedules,
	CostItems,
	CostItemDetails,
	CostRateItems,
	CostProductItems,
	CostSelectItem,
	CostAddCostSchedule,
	CostEditCostSchedule,
	CostRemoveCostSchedule,
	CostAddCostItem,
	CostEditCostItem,
	CostRemoveCostItem,
	CostAddQuantity,
	CostEditQuantity,
	CostRemoveQuantity,
	CostAddValue,
	CostEditValue,
	CostEditValueFormula,
	CostRemoveValue,
	CostAssignRate,
	CostAssignProducts,
	CostUnassignProducts,
];
