// This file was generated with the assistance of an AI coding tool.
//
// bonsai.tool.Cost — cost schedules and cost items of the live IFC files,
// mirroring bonsai.tool.Cost in Python. Graph walks, quantities,
// assignments and unit symbols are ifcopenshell.util.cost and util.unit;
// writes are ifcopenshell.api.cost and api.control, all transpiled into the
// local ifcopenshell build. Each item's totals follow Bonsai's cost panel
// (bim/module/cost/data.py). Each method does one thing on entities it is
// given; the Cost.* operators find those with tool.Ifc and combine them.
//
// Three pieces of util.cost are ported here rather than called: the
// transpiled get_primitive_applied_value reads Python's isinstance(value,
// float) as "not an integer" and throws on whole-number prices, the
// transpiled serialise_cost_value never strips its outer brackets, and
// CostValueUnserialiser (a lark grammar) was not transpiled at all, which
// leaves api.cost.edit_cost_value_formula doing nothing. Each port follows
// ifcopenshell/util/cost.py and api/cost/edit_cost_value_formula.py.

import * as ControlAPI from 'ifcopenshell/api/control';
import * as CostAPI from 'ifcopenshell/api/cost';
import * as CostUtil from 'ifcopenshell/util/cost';
import * as UnitUtil from 'ifcopenshell/util/unit';

import { store } from '../context/store.js';

const OPERATOR_SYMBOLS = { ADD: '+', DIVIDE: '/', MULTIPLY: '*', SUBTRACT: '-' };
const SYMBOL_OPERATORS = { '+': 'ADD', '/': 'DIVIDE', '*': 'MULTIPLY', '-': 'SUBTRACT' };

function text( value ) {

	return value == null ? '' : String( value );

}

function isEntity( value ) {

	return !! value && typeof value === 'object' && typeof value.isA === 'function';

}

// util.cost.get_primitive_applied_value, for any number.
function primitiveValue( applied ) {

	if ( ! applied ) return 0;
	if ( typeof applied === 'number' ) return applied;
	if ( isEntity( applied ) ) {

		if ( applied.isA( 'IfcMeasureWithUnit' ) ) return primitiveValue( applied.ValueComponent );
		const wrapped = applied.wrappedValue;
		if ( typeof wrapped === 'number' ) return wrapped;

	}

	return 0;

}

// Python's str() of a float: 30.0 prints as "30.0".
function pythonFloat( value ) {

	return Number.isInteger( value ) ? value.toFixed( 1 ) : String( value );

}

function serialiseInner( value ) {

	let result = '';
	const components = value.Components ?? [];
	if ( value.ArithmeticOperator && components.length ) {

		result = components.map( serialiseInner ).join( OPERATOR_SYMBOLS[ value.ArithmeticOperator ] );

	} else if ( value.AppliedValue != null ) {

		const applied = value.AppliedValue;
		result = isEntity( applied ) && applied.isA( 'IfcMonetaryMeasure' ) ? pythonFloat( applied.wrappedValue ) : '?';

	}

	let category = '';
	if ( value.Category === '*' ) category = 'SUM';
	else if ( value.Category ) category = value.Category;
	if ( ! category && ! result ) result = '0';
	if ( category ) return `${ category }(${ result })`;
	if ( components.length ) return `(${ result })`;
	return result;

}

// Bonsai's formula grammar (CostValueUnserialiser):
//   formula:  operand (operator operand)*
//   operand:  value | category "(" formula ")"
//   value:    NUMBER?         category: WORD?
// A formula with several operators keeps the last one, as the Python does.
function parseFormula( source ) {

	const tokens = [];
	const pattern = /\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z]+)|([()+\-*/]))/y;
	let index = 0;
	const input = String( source );
	while ( index < input.length ) {

		if ( /^\s*$/.test( input.slice( index ) ) ) break;
		pattern.lastIndex = index;
		const match = pattern.exec( input );
		if ( ! match ) throw new Error( `Unexpected "${ input.slice( index ).trim()[ 0 ] }" in the formula.` );
		index = pattern.lastIndex;
		if ( match[ 1 ] ) tokens.push( { type: 'number', value: match[ 1 ] } );
		else if ( match[ 2 ] ) tokens.push( { type: 'word', value: match[ 2 ] } );
		else tokens.push( { type: match[ 3 ] } );

	}

	let position = 0;
	const peek = () => tokens[ position ];
	const next = () => tokens[ position ++ ];

	const operand = () => {

		const token = peek();
		const opens = ( offset ) => tokens[ position + offset ]?.type === '(';
		if ( token?.type === '(' || ( token?.type === 'word' && opens( 1 ) ) ) {

			const data = {};
			if ( token.type === 'word' ) {

				next();
				data.Category = token.value.toLowerCase() === 'sum' ? '*' : token.value;

			}

			next();
			const inner = formula();
			if ( next()?.type !== ')' ) throw new Error( 'A bracket is not closed in the formula.' );
			if ( inner.Components ) {

				data.Components = inner.Components;
				data.ArithmeticOperator = inner.ArithmeticOperator;

			} else {

				data.AppliedValue = inner.AppliedValue;

			}

			return data;

		}

		if ( token?.type === 'number' ) {

			next();
			return { AppliedValue: Number( token.value ) };

		}

		if ( token?.type === 'word' ) throw new Error( `"${ token.value }" needs brackets: ${ token.value }(…).` );
		return { AppliedValue: null };

	};

	const formula = () => {

		const operands = [ operand() ];
		let operator = null;
		while ( peek() && SYMBOL_OPERATORS[ peek().type ] ) {

			operator = SYMBOL_OPERATORS[ next().type ];
			operands.push( operand() );

		}

		return operands.length === 1 ? operands[ 0 ] : { Components: operands, ArithmeticOperator: operator };

	};

	const result = formula();
	if ( position < tokens.length ) throw new Error( `Unexpected "${ peek().type === 'word' || peek().type === 'number' ? peek().value : peek().type }" in the formula.` );
	return result;

}

export class Cost {

	// MATHS

	// util.cost.calculate_applied_value, with sum_child_root_elements.
	static appliedValue( root, value, categoryFilter = null ) {

		const components = value.Components ?? [];
		if ( value.ArithmeticOperator && components.length ) {

			const values = components.map( ( component ) => Cost.appliedValue( root, component, categoryFilter ) );
			if ( value.ArithmeticOperator === 'ADD' ) return values.reduce( ( a, b ) => a + b, 0 );
			let result = values.shift();
			for ( const next of values ) {

				if ( value.ArithmeticOperator === 'DIVIDE' ) {

					if ( next !== 0 ) result /= next;

				} else if ( value.ArithmeticOperator === 'MULTIPLY' ) {

					result *= next;

				} else if ( value.ArithmeticOperator === 'SUBTRACT' ) {

					result -= next;

				}

			}

			return result;

		}

		const nested = ( root.IsNestedBy ?? [] ).length > 0;
		if ( value.Category == null ) return primitiveValue( value.AppliedValue );
		if ( value.Category === '*' ) return nested ? Cost.sumChildren( root ) : primitiveValue( value.AppliedValue );
		if ( value.Category ) return nested ? Cost.sumChildren( root, value.Category ) : primitiveValue( value.AppliedValue );
		return 0;

	}

	// util.cost.sum_child_root_elements, for cost items.
	static sumChildren( root, categoryFilter = null ) {

		let result = 0;
		for ( const rel of root.IsNestedBy ?? [] ) {

			for ( const child of rel.RelatedObjects ?? [] ) {

				const priced = CostUtil.getAssignedRateCostItem( child ) ?? child;
				for ( const value of priced.CostValues ?? [] ) {

					if ( categoryFilter && value.Category !== categoryFilter ) continue;
					const applied = Cost.appliedValue( priced, value );
					const quantity = CostUtil.getTotalQuantity( child ) ?? 1;
					if ( value.UnitBasis ) result += ( quantity / primitiveValue( value.UnitBasis.ValueComponent ) ) * applied;
					else result += quantity * applied;

				}

			}

		}

		return result;

	}

	// util.cost.serialise_cost_value.
	static formula( value ) {

		const result = serialiseInner( value );
		return result.startsWith( '(' ) && result.endsWith( ')' ) ? result.slice( 1, - 1 ) : result;

	}

	// util.cost.unserialise_cost_value: the formula as nested attribute data,
	// each level tied to the existing component at its place ("ifc").
	// Throws when the formula does not parse.
	static parseFormula( formula, value = null ) {

		const data = parseFormula( formula );
		const attach = ( entity, level ) => {

			level.ifc = entity;
			( level.Components ?? [] ).forEach( ( component, index ) => {

				const existing = entity?.Components?.[ index ];
				if ( existing ) attach( existing, component );

			} );

		};

		if ( value ) attach( value, data );
		return data;

	}

	// READ

	// The project currency (IfcMonetaryUnit) of a file, or ''.
	static currency( file ) {

		return file ? text( file.byType( 'IfcMonetaryUnit' )[ 0 ]?.Currency ) : '';

	}

	// Every IfcCostSchedule in every model with a live file.
	static schedules() {

		const result = [];
		for ( const entry of store.models ) {

			if ( ! entry.file ) continue;
			const currency = Cost.currency( entry.file );
			for ( const schedule of entry.file.byType( 'IfcCostSchedule' ) ) {

				result.push( {
					modelId: entry.id,
					modelName: entry.name,
					id: schedule.id(),
					name: text( schedule.Name ) || `Cost schedule #${ schedule.id() }`,
					predefinedType: text( schedule.PredefinedType ),
					status: text( schedule.Status ),
					itemCount: CostUtil.getScheduleCostItems( schedule ).length,
					currency,
				} );

			}

		}

		return result;

	}

	// One cost item as Bonsai's cost panel computes it: quantity and its
	// unit, each cost value with its formula, the applied value (the rate),
	// the unit basis, and the total cost.
	static itemData( file, item ) {

		const quantity = CostUtil.getTotalQuantity( item );
		const quantities = item.CostQuantities ?? [];
		let unitSymbol = '-';
		if ( quantities.length ) {

			const unit = UnitUtil.getPropertyUnit( quantities[ 0 ], file );
			if ( unit ) unitSymbol = UnitUtil.getUnitSymbol( unit );
			if ( quantities[ 0 ].isA( 'IfcQuantityCount' ) ) unitSymbol = 'U';

		}

		const rateItem = CostUtil.getAssignedRateCostItem( item );
		const root = rateItem ?? item;
		let appliedValue = 0;
		// As in data.py: any value with a unit basis prices per that basis, and
		// the divisor is what the last value set (1 when it has none).
		let hasUnitBasis = false;
		let divisor = 1;
		const values = [];
		for ( const value of item.CostValues ?? [] ) {

			const applied = Cost.appliedValue( root, value );
			appliedValue += applied;
			if ( value.UnitBasis ) {

				divisor = primitiveValue( value.UnitBasis.ValueComponent );
				hasUnitBasis = true;

			} else {

				divisor = 1;

			}

			values.push( {
				id: value.id(),
				name: text( value.Name ),
				category: value.Category ?? null,
				applied,
				formula: Cost.formula( value ),
			} );

		}

		const costQuantity = quantity ?? 1;
		const totalCost = hasUnitBasis ? ( appliedValue * costQuantity ) / divisor : appliedValue * costQuantity;

		return {
			id: item.id(),
			name: text( item.Name ) || 'Unnamed',
			identification: text( item.Identification ),
			quantity,
			unitSymbol,
			values,
			appliedValue,
			unitBasis: hasUnitBasis ? divisor : null,
			totalCost,
			rateItem: rateItem ? { id: rateItem.id(), name: text( rateItem.Name ), identification: text( rateItem.Identification ) } : null,
		};

	}

	// The item tree of one schedule, depth first, one plain row per item.
	static itemRows( file, schedule ) {

		const rows = [];
		const walk = ( item, parentId, depth ) => {

			const nested = CostUtil.getNestedCostItems( item );
			rows.push( {
				...Cost.itemData( file, item ),
				parentId,
				depth,
				hasChildren: nested.length > 0,
				productCount: CostUtil.getCostItemAssignments( item, { filterByType: 'PRODUCT' } ).length,
			} );
			for ( const child of nested ) walk( child, item.id(), depth + 1 );

		};

		for ( const root of CostUtil.getRootCostItems( schedule ) ) walk( root, 0, 0 );
		return rows;

	}

	// GlobalIds of the elements a cost item prices; with `deep`, those of its
	// nested items too.
	static itemProducts( item, { deep = false } = {} ) {

		const products = CostUtil.getCostItemAssignments( item, { filterByType: 'PRODUCT', isDeep: deep } );
		return [ ...new Set( products.map( ( product ) => product.GlobalId ).filter( Boolean ) ) ];

	}

	// Cost items that price one element, priced as in itemRows(), with the
	// currency of the file.
	static productItems( file, product ) {

		const currency = Cost.currency( file );
		return CostUtil.getCostItemsForProduct( product ).map( ( item ) => {

			const schedule = CostUtil.getCostSchedule( item );
			return {
				...Cost.itemData( file, item ),
				scheduleId: schedule ? schedule.id() : null,
				schedule: text( schedule?.Name ),
				currency,
			};

		} );

	}

	// What the cost item editor shows: attributes, quantities, values, the
	// assigned rate, and how many elements the item prices.
	static itemDetails( file, item ) {

		const data = Cost.itemData( file, item );
		return {
			...data,
			description: text( item.Description ),
			quantities: ( item.CostQuantities ?? [] ).map( ( quantity ) => ( {
				id: quantity.id(),
				type: quantity.isA(),
				name: text( quantity.Name ),
				value: quantity.get( 3 ),
				attribute: quantity.attributeName( 3 ),
			} ) ),
			productCount: CostUtil.getCostItemAssignments( item, { filterByType: 'PRODUCT' } ).length,
			hasChildren: CostUtil.getNestedCostItems( item ).length > 0,
		};

	}

	// Cost items of every schedule of rates in a file, for assigning a rate.
	static rateItems( file ) {

		const result = [];
		for ( const schedule of file.byType( 'IfcCostSchedule' ) ) {

			if ( schedule.PredefinedType !== 'SCHEDULEOFRATES' ) continue;
			for ( const item of CostUtil.getScheduleCostItems( schedule ) ) {

				if ( ! ( item.CostValues ?? [] ).length ) continue;
				result.push( {
					id: item.id(),
					name: text( item.Name ) || 'Unnamed',
					identification: text( item.Identification ),
					schedule: text( schedule.Name ),
				} );

			}

		}

		return result;

	}

	// WRITE — ifcopenshell.api.cost and api.control on a live file.
	// ifcopenshell-js has no transactions, so none of this can be undone.

	static addCostSchedule( file, { name, predefinedType } ) {

		return CostAPI.addCostSchedule( file, { name, predefinedType } );

	}

	static editCostSchedule( file, schedule, attributes ) {

		CostAPI.editCostSchedule( file, schedule, attributes );

	}

	static removeCostSchedule( file, schedule ) {

		CostAPI.removeCostSchedule( file, schedule );

	}

	// A root item of `costSchedule`, or a nested item of `costItem`.
	static addCostItem( file, { costSchedule = null, costItem = null } ) {

		return CostAPI.addCostItem( file, costItem ? { costItem } : { costSchedule } );

	}

	static editCostItem( file, item, attributes ) {

		CostAPI.editCostItem( file, item, attributes );

	}

	static removeCostItem( file, item ) {

		CostAPI.removeCostItem( file, item );

	}

	static addCostItemQuantity( file, item, ifcClass ) {

		return CostAPI.addCostItemQuantity( file, item, { ifcClass } );

	}

	static editCostItemQuantity( file, quantity, attributes ) {

		CostAPI.editCostItemQuantity( file, quantity, attributes );

	}

	static removeCostItemQuantity( file, item, quantity ) {

		CostAPI.removeCostItemQuantity( file, item, quantity );

	}

	static addCostValue( file, parent ) {

		return CostAPI.addCostValue( file, parent );

	}

	static editCostValue( file, value, attributes ) {

		CostAPI.editCostValue( file, value, attributes );

	}

	static removeCostValue( file, parent, value ) {

		CostAPI.removeCostValue( file, parent, value );

	}

	// api.cost.edit_cost_value_formula: apply parsed formula data to a cost
	// value, reusing its components in place and adding missing ones.
	static editCostValueFormula( file, value, formula ) {

		const apply = ( data, parent = null ) => {

			const entity = data.ifc ?? CostAPI.addCostValue( file, parent );
			if ( 'AppliedValue' in data ) CostAPI.editCostValue( file, entity, { AppliedValue: data.AppliedValue || null } );
			entity.Category = data.Category ?? null;
			entity.ArithmeticOperator = data.ArithmeticOperator ?? null;
			for ( const component of data.Components ?? [] ) apply( component, entity );

		};

		apply( Cost.parseFormula( formula, value ) );

	}

	// Copy the rate's values onto the item (api.cost.assign_cost_value).
	static assignCostValue( file, item, rate ) {

		CostAPI.assignCostValue( file, item, rate );

	}

	static assignControl( file, control, objects ) {

		return ControlAPI.assignControl( file, control, objects );

	}

	static unassignControl( file, control, objects ) {

		ControlAPI.unassignControl( file, control, objects );

	}

	static assignedRate( item ) {

		return CostUtil.getAssignedRateCostItem( item );

	}

}

export default Cost;
