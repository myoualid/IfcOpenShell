// This file was generated with the assistance of an AI coding tool.
//
// bonsai.tool.Cost — cost schedules and cost items of the live IFC files.
// Graph walks, quantities, assignments and rate lookups are
// ifcopenshell.util.cost and util.unit from the local ifcopenshell build.
// Each item's totals follow Bonsai's cost panel (bim/module/cost/data.py).
//
// The applied-value maths is ported here rather than called: the transpiled
// get_primitive_applied_value reads Python's isinstance(value, float) as "not
// an integer", so it throws on every whole-number price, and the transpiled
// serialise_cost_value never strips its outer brackets. Both functions below
// follow ifcopenshell/util/cost.py line for line.

// 'ifcopenshell/util/*' is imported where it is used, never at the top, for
// the same reason as 'ifcopenshell' in tool/Ifc.js.
import { store } from '../context/store.js';

let modules = null;

function load() {

	modules ??= Promise.all( [
		import( 'ifcopenshell/util/cost' ),
		import( 'ifcopenshell/util/unit' ),
	] ).then( ( [ cost, unit ] ) => ( { cost, unit } ) );
	return modules;

}

const OPERATOR_SYMBOLS = { ADD: '+', DIVIDE: '/', MULTIPLY: '*', SUBTRACT: '-' };

function text( value ) {

	return value == null ? '' : String( value );

}

function isEntity( value ) {

	return !! value && typeof value === 'object' && typeof value.isA === 'function';

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

// util.cost.serialise_cost_value.
function serialiseCostValue( value ) {

	const result = serialiseInner( value );
	return result.startsWith( '(' ) && result.endsWith( ')' ) ? result.slice( 1, - 1 ) : result;

}

export class Cost {

	// util.cost.calculate_applied_value, with sum_child_root_elements.
	static appliedValue( cost, root, value, categoryFilter = null ) {

		const components = value.Components ?? [];
		if ( value.ArithmeticOperator && components.length ) {

			const values = components.map( ( component ) => Cost.appliedValue( cost, root, component, categoryFilter ) );
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
		if ( value.Category === '*' ) return nested ? Cost.sumChildren( cost, root ) : primitiveValue( value.AppliedValue );
		if ( value.Category ) return nested ? Cost.sumChildren( cost, root, value.Category ) : primitiveValue( value.AppliedValue );
		return 0;

	}

	// util.cost.sum_child_root_elements, for cost items.
	static sumChildren( cost, root, categoryFilter = null ) {

		let result = 0;
		for ( const rel of root.IsNestedBy ?? [] ) {

			for ( const child of rel.RelatedObjects ?? [] ) {

				const priced = cost.getAssignedRateCostItem( child ) ?? child;
				for ( const value of priced.CostValues ?? [] ) {

					if ( categoryFilter && value.Category !== categoryFilter ) continue;
					const applied = Cost.appliedValue( cost, priced, value );
					const quantity = cost.getTotalQuantity( child ) ?? 1;
					if ( value.UnitBasis ) result += ( quantity / primitiveValue( value.UnitBasis.ValueComponent ) ) * applied;
					else result += quantity * applied;

				}

			}

		}

		return result;

	}

	// The project currency (IfcMonetaryUnit), or '' when there is none.
	static currency( modelId ) {

		const file = fileOf( modelId );
		if ( ! file ) return '';
		return text( file.byType( 'IfcMonetaryUnit' )[ 0 ]?.Currency );

	}

	// Every IfcCostSchedule in every model with a live file.
	static async schedules() {

		const { cost } = await load();
		const result = [];
		for ( const entry of store.models ) {

			if ( ! entry.file ) continue;
			const currency = Cost.currency( entry.id );
			for ( const schedule of entry.file.byType( 'IfcCostSchedule' ) ) {

				result.push( {
					modelId: entry.id,
					modelName: entry.name,
					id: schedule.id(),
					name: text( schedule.Name ) || `Cost schedule #${ schedule.id() }`,
					predefinedType: text( schedule.PredefinedType ),
					itemCount: cost.getScheduleCostItems( schedule ).length,
					currency,
				} );

			}

		}

		return result;

	}

	// One cost item as Bonsai's cost panel computes it: quantity and its
	// unit, each cost value with its formula, the applied value (the rate),
	// the unit basis, and the total cost.
	static itemData( cost, unit, file, item ) {

		const quantity = cost.getTotalQuantity( item );
		const quantities = item.CostQuantities ?? [];
		let unitSymbol = '-';
		if ( quantities.length ) {

			const quantityUnit = unit.getPropertyUnit( quantities[ 0 ], file );
			if ( quantityUnit ) unitSymbol = unit.getUnitSymbol( quantityUnit );
			if ( quantities[ 0 ].isA( 'IfcQuantityCount' ) ) unitSymbol = 'U';

		}

		const rateItem = cost.getAssignedRateCostItem( item );
		const root = rateItem ?? item;
		let appliedValue = 0;
		// As in data.py: any value with a unit basis prices per that basis, and
		// the divisor is what the last value set (1 when it has none).
		let hasUnitBasis = false;
		let divisor = 1;
		const values = [];
		for ( const value of item.CostValues ?? [] ) {

			const applied = Cost.appliedValue( cost, root, value );
			appliedValue += applied;
			if ( value.UnitBasis ) {

				divisor = primitiveValue( value.UnitBasis.ValueComponent );
				hasUnitBasis = true;

			} else {

				divisor = 1;

			}

			values.push( {
				name: text( value.Name ),
				category: value.Category ?? null,
				applied,
				formula: serialiseCostValue( value ),
			} );

		}

		const costQuantity = quantity ?? 1;
		const totalCost = hasUnitBasis ? ( appliedValue * costQuantity ) / divisor : appliedValue * costQuantity;
		const unitBasis = hasUnitBasis ? divisor : null;

		return {
			id: item.id(),
			name: text( item.Name ) || 'Unnamed',
			identification: text( item.Identification ),
			quantity,
			unitSymbol,
			values,
			appliedValue,
			unitBasis,
			totalCost,
			rateItem: rateItem ? { id: rateItem.id(), name: text( rateItem.Name ), identification: text( rateItem.Identification ) } : null,
		};

	}

	// The item tree of one schedule, depth first, one plain row per item.
	static async items( modelId, scheduleId ) {

		const file = fileOf( modelId );
		const schedule = file ? byId( file, scheduleId ) : null;
		if ( ! schedule || ! schedule.isA( 'IfcCostSchedule' ) ) return [];

		const { cost, unit } = await load();
		const rows = [];
		const walk = ( item, parentId, depth ) => {

			const nested = cost.getNestedCostItems( item );
			rows.push( {
				...Cost.itemData( cost, unit, file, item ),
				parentId,
				depth,
				hasChildren: nested.length > 0,
				productCount: cost.getCostItemAssignments( item, { filterByType: 'PRODUCT' } ).length,
			} );
			for ( const child of nested ) walk( child, item.id(), depth + 1 );

		};

		for ( const root of cost.getRootCostItems( schedule ) ) walk( root, 0, 0 );
		return rows;

	}

	// GlobalIds of the elements assigned to a cost item; with `deep`, to its
	// nested items too.
	static async itemProducts( modelId, itemId, { deep = false } = {} ) {

		const file = fileOf( modelId );
		const item = file ? byId( file, itemId ) : null;
		if ( ! item || ! item.isA( 'IfcCostItem' ) ) return [];

		const { cost } = await load();
		const products = cost.getCostItemAssignments( item, { filterByType: 'PRODUCT', isDeep: deep } );
		return [ ...new Set( products.map( ( product ) => product.GlobalId ).filter( Boolean ) ) ];

	}

	// Cost items an element is assigned to, priced as in items().
	static async productItems( modelId, guid ) {

		const file = fileOf( modelId );
		const product = file && guid ? byGuid( file, guid ) : null;
		if ( ! product ) return [];

		const { cost, unit } = await load();
		return cost.getCostItemsForProduct( product ).map( ( item ) => {

			const schedule = cost.getCostSchedule( item );
			return {
				...Cost.itemData( cost, unit, file, item ),
				scheduleId: schedule ? schedule.id() : null,
				schedule: text( schedule?.Name ),
			};

		} );

	}

}

export default Cost;
