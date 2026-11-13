// This file was generated with the assistance of an AI coding tool.
//
// The cost sheet's dialogs: a cost item and cost schedule settings. Each
// one keeps its edits until Save, then runs the Cost.* operators in order.

import { Container, InputDropdown, StackPanel, Text } from '@aeco-dev/gui';

import ops from '../../ops.js';
import {
	confirmDialog,
	FormDialog,
	listLine,
	row,
	runSteps,
	section,
	stepFailure,
	suggestInput,
} from '../../util/dialog.js';
import {
	dropdownInput,
	element,
	field,
	iconButton,
	plural,
	setDropdown,
	textButton,
	textInput,
} from '../../util/sheet.js';

const SCHEDULE_TYPES = [
	{ value: 'COSTPLAN', label: 'Cost plan' },
	{ value: 'ESTIMATE', label: 'Estimate' },
	{ value: 'BUDGET', label: 'Budget' },
	{ value: 'TENDER', label: 'Tender' },
	{ value: 'PRICEDBILLOFQUANTITIES', label: 'Priced bill of quantities' },
	{ value: 'UNPRICEDBILLOFQUANTITIES', label: 'Unpriced bill of quantities' },
	{ value: 'SCHEDULEOFRATES', label: 'Schedule of rates' },
	{ value: 'USERDEFINED', label: 'User defined' },
	{ value: 'NOTDEFINED', label: 'Not defined' },
];
const STATUSES = [ 'DRAFT', 'ISSUED', 'APPROVED', 'FINAL' ];

export const QUANTITY_TYPES = [
	{ value: 'IfcQuantityCount', label: 'Count' },
	{ value: 'IfcQuantityLength', label: 'Length' },
	{ value: 'IfcQuantityArea', label: 'Area' },
	{ value: 'IfcQuantityVolume', label: 'Volume' },
	{ value: 'IfcQuantityWeight', label: 'Weight' },
	{ value: 'IfcQuantityTime', label: 'Time' },
	{ value: 'IfcQuantityNumber', label: 'Number' },
];

const FORMULA_HELP = 'A number such as 45.50; SUM() adds up the nested items; Labour() adds up their Labour values. Combine with + - * / and brackets.';

export function itemLabel( item ) {

	return [ item.identification, item.name ].filter( Boolean ).join( '  ' ) || 'Unnamed item';

}

function quantityLabel( type ) {

	return QUANTITY_TYPES.find( ( entry ) => entry.value === type )?.label ?? type;

}

function valueLabel( value ) {

	if ( value.type === 'SUM' || value.category === '*' ) return 'Sum of nested';
	return value.name || value.category || 'Rate';

}

// Everything about one cost item, staged until Save.
export class CostItemDialog {

	// money( value ) formats in the schedule currency; onSaved( message )
	// reports what was done, for the sheet's status line.
	constructor( { onSaved } ) {

		this.onSaved = onSaved;
		this.item = null;
		this.money = ( value ) => String( value );
		this._key = 0;

		this.form = new FormDialog( {
			title: 'Cost item',
			icon: 'request_quote',
			width: '34rem',
			note: 'Nothing changes until you save.',
			onSave: () => this._save(),
			onDelete: () => this._remove(),
			deleteLabel: 'Delete item',
		} );

		this._identification = textInput( () => {}, { placeholder: 'e.g. 2.1.3' } );
		this._name = textInput( () => {}, { placeholder: 'What is priced' } );
		this._description = textInput( () => {}, { placeholder: 'Optional specification notes' } );
		this._total = new Text( '' ).addClass( 'bonsai-dialog-total' );

		this._quantities = new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-list' );
		this._quantityType = dropdownInput( QUANTITY_TYPES, () => {} );
		this._quantityType.setValue( 'IfcQuantityArea' );

		this._values = new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-list' );
		this._valuesNote = new Text( '' ).addClass( 'bonsai-dialog-note' );
		this._category = textInput( () => {}, { placeholder: 'Category, e.g. Labour' } );
		this._valueActions = row(
			textButton( 'Rate', 'add', () => this._stageValue( { type: 'FIXED', formula: '0' } ), { title: 'Add a rate you type, such as 45.50' } ),
			textButton( 'Sum of nested', 'functions', () => this._stageValue( { type: 'SUM', formula: 'SUM()' } ), { title: 'Price this item as the total of the items inside it' } ),
			this._category,
			textButton( 'Category', 'category', () => this._stageCategory(), { title: 'Add up the nested values of one category, such as Labour' } ),
		);

		this._rate = new InputDropdown();
		this._rate.dom.setAttribute( 'aria-label', 'Rate from a schedule of rates' );
		this._rate.onChange( () => this._renderValues() );
		this._rateNote = new Text( '' ).addClass( 'bonsai-dialog-note' );

		this._productsTitle = new Text( '' ).addClass( 'bonsai-dialog-subheading' );
		this._productsList = new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-list' );

		this.form.body.add(
			section( 'Item',
				row( field( 'Code', this._identification ).addClass( 'is-narrow' ), field( 'Description', this._name ) ),
				field( 'Notes', this._description ),
				this._total,
			),
			section( 'Quantity',
				this._quantities,
				row( this._quantityType, textButton( 'Add quantity', 'add', () => this._stageQuantity() ) ),
			),
			section( 'Rate',
				field( 'From a schedule of rates', this._rate ),
				this._rateNote,
				this._values,
				this._valuesNote,
				this._valueActions,
			),
			section( 'Elements',
				this._productsTitle,
				this._productsList,
				row(
					textButton( 'Add selected', 'add_link', () => this._stageSelection( true ), { title: 'Price the elements selected in the 3D view with this item' } ),
					textButton( 'Remove selected', 'link_off', () => this._stageSelection( false ), { title: 'Stop pricing the elements selected in the 3D view' } ),
					textButton( 'Show in 3D', 'center_focus_strong', () => this._show() ),
				),
			),
		);

	}

	get isOpen() {

		return this.form.isOpen;

	}

	open( itemId, money ) {

		const result = ops.Cost.ItemDetails( { item: itemId } );
		if ( ! result?.result ) return false;
		this.money = money ?? this.money;
		this._load( result.result );
		this.form.open();
		return true;

	}

	_load( item ) {

		this.item = item;
		this._quantityInputs = new Map();
		this._valueInputs = new Map();
		this.draft = {
			quantities: { remove: new Set(), add: [] },
			values: { remove: new Set(), add: [] },
			products: { add: new Map(), remove: new Map() },
		};

		this.form.setTitle( itemLabel( item ) );
		this._identification.setValue( item.identification );
		this._name.setValue( item.name === 'Unnamed' ? '' : item.name );
		this._description.setValue( item.description );
		this._total.setValue( this._totalText( item ) );

		const rates = ( ops.Cost.RateItems().result ?? [] ).filter( ( rate ) => rate.id !== item.id );
		setDropdown( this._rate, [
			{ value: '', label: rates.length ? 'None: type the rate below' : 'No schedule of rates in this model' },
			...rates.map( ( rate ) => ( { value: String( rate.id ), label: `${ itemLabel( rate ) } — ${ rate.schedule }` } ) ),
		], item.rateItem ? String( item.rateItem.id ) : '' );
		this._rate.setDisabled( ! rates.length );

		this._renderQuantities();
		this._renderValues();
		this._renderProducts();

	}

	_totalText( item ) {

		if ( ! item.values.length ) return item.hasChildren ? 'Not priced yet: add “Sum of nested” to total the items inside.' : 'Not priced yet: add a rate below.';
		const quantity = item.quantity == null ? '' : `${ Number( item.quantity.toFixed( 3 ) ) } ${ item.unitSymbol } × `;
		const basis = item.unitBasis && item.unitBasis !== 1 ? ` per ${ item.unitBasis } ${ item.unitSymbol }` : '';
		return `Now: ${ quantity }${ this.money( item.appliedValue ) }${ basis } = ${ this.money( item.totalCost ) }`;

	}

	// An input line: a label, the input, an optional figure, and remove.
	_inputLine( label, input, { figure = '', state = '', onRemove } ) {

		const line = new Container().addClass( 'bonsai-dialog-line is-input' );
		if ( state ) line.addClass( `is-${ state }` );
		line.dom.append( element( 'span', 'bonsai-dialog-line-detail is-label', label ) );
		line.add( input );
		if ( figure ) line.dom.append( element( 'span', 'bonsai-dialog-line-detail', figure ) );
		line.add( iconButton( state === 'removed' ? 'undo' : 'close', state === 'removed' ? 'Keep it' : `Remove the ${ label.toLowerCase() }`, onRemove ) );
		return line;

	}

	_renderQuantities() {

		const staged = this.draft.quantities;
		this._quantities.clear();
		for ( const quantity of this.item.quantities ) {

			const removed = staged.remove.has( quantity.id );
			let input = this._quantityInputs.get( quantity.id );
			if ( ! input ) {

				input = textInput( () => {}, { type: 'number' } );
				input.dom.step = 'any';
				input.setValue( quantity.value ?? '' );

			}

			input.setDisabled( removed );
			this._quantityInputs.set( quantity.id, input );
			this._quantities.add( this._inputLine( quantityLabel( quantity.type ), input, {
				state: removed ? 'removed' : '',
				onRemove: () => {

					if ( removed ) staged.remove.delete( quantity.id );
					else staged.remove.add( quantity.id );
					this._renderQuantities();

				},
			} ) );

		}

		for ( const entry of staged.add ) {

			entry.input ??= textInput( () => {}, { type: 'number', placeholder: 'Quantity' } );
			entry.input.dom.step = 'any';
			this._quantities.add( this._inputLine( quantityLabel( entry.ifcClass ), entry.input, {
				state: 'added',
				onRemove: () => {

					staged.add.splice( staged.add.indexOf( entry ), 1 );
					this._renderQuantities();

				},
			} ) );

		}

		if ( ! this.item.quantities.length && ! staged.add.length ) {

			this._quantities.add( new Text( 'None: the item counts once. Add an area, a length or a count to measure it.' ).addClass( 'bonsai-dialog-empty' ) );

		}

	}

	get _rateChanged() {

		return this._rate.getValue() !== ( this.item.rateItem ? String( this.item.rateItem.id ) : '' );

	}

	_renderValues() {

		const rateChanged = this._rateChanged;
		const rateId = Number( this._rate.getValue() );
		this._rateNote.setValue( rateChanged && rateId
			? 'When you save, the values of this rate are copied onto the item and the item is linked to it.'
			: this.item.rateItem && ! rateChanged ? 'The values below were copied from this rate.' : '' );
		this._values.setHidden( rateChanged && Boolean( rateId ) );
		this._valueActions.setHidden( rateChanged && Boolean( rateId ) );
		this._valuesNote.setHidden( rateChanged && Boolean( rateId ) );
		this._valuesNote.setValue( FORMULA_HELP );

		const staged = this.draft.values;
		this._values.clear();
		const formulaInput = ( formula ) => {

			const input = textInput( () => {}, { placeholder: 'e.g. 45.50 or SUM()' } );
			input.setValue( formula );
			input.dom.addEventListener( 'input', () => this._check( input ) );
			return input;

		};

		for ( const value of this.item.values ) {

			const removed = staged.remove.has( value.id );
			const input = this._valueInputs.get( value.id ) ?? formulaInput( value.formula );
			input.setDisabled( removed );
			this._valueInputs.set( value.id, input );
			this._values.add( this._inputLine( valueLabel( value ), input, {
				figure: this.money( value.applied ),
				state: removed ? 'removed' : '',
				onRemove: () => {

					if ( removed ) staged.remove.delete( value.id );
					else staged.remove.add( value.id );
					this._renderValues();

				},
			} ) );

		}

		for ( const entry of staged.add ) {

			entry.input ??= formulaInput( entry.formula );
			this._values.add( this._inputLine( valueLabel( entry ), entry.input, {
				state: 'added',
				onRemove: () => {

					staged.add.splice( staged.add.indexOf( entry ), 1 );
					this._renderValues();

				},
			} ) );

		}

		if ( ! this.item.values.length && ! staged.add.length ) {

			this._values.add( new Text( 'No rate yet.' ).addClass( 'bonsai-dialog-empty' ) );

		}

	}

	// Mark a formula that does not read, as you type.
	_check( input ) {

		const formula = input.getValue().trim();
		const result = formula ? ops.Cost.CheckFormula( formula ) : { status: 'FINISHED' };
		const bad = result.status === 'CANCELLED';
		input.dom.classList.toggle( 'is-invalid', bad );
		input.dom.title = bad ? result.message : '';
		this.form.setMessage( bad ? `“${ formula }”: ${ result.message }` : '', bad ? 'error' : '' );

	}

	_renderProducts() {

		const { add, remove } = this.draft.products;
		const count = this.item.productCount + add.size - remove.size;
		this._productsTitle.setValue( `Prices ${ plural( Math.max( 0, count ), 'element' ) }` );
		this._productsList.clear();
		for ( const [ guid, label ] of add ) {

			this._productsList.add( listLine( label, 'to add', {
				state: 'added',
				action: [ 'close', 'Do not add', () => add.delete( guid ) ],
				after: () => this._renderProducts(),
			} ) );

		}

		for ( const [ guid, label ] of remove ) {

			this._productsList.add( listLine( label, 'to remove', {
				state: 'removed',
				action: [ 'undo', 'Keep it', () => remove.delete( guid ) ],
				after: () => this._renderProducts(),
			} ) );

		}

	}

	_stageQuantity() {

		const ifcClass = this._quantityType.getValue();
		const entry = { ifcClass };
		this.draft.quantities.add.push( entry );
		this._renderQuantities();
		entry.input?.dom.focus();

	}

	_stageValue( entry ) {

		this.draft.values.add.push( entry );
		this._renderValues();
		entry.input?.dom.focus();
		entry.input?.dom.select();

	}

	_stageCategory() {

		const category = this._category.getValue().trim();
		if ( ! category ) {

			this.form.setMessage( 'Type a category first, such as Labour or Material.', 'error' );
			return;

		}

		this._category.setValue( '' );
		this.form.setMessage( '' );
		this._stageValue( { type: 'CATEGORY', category, formula: `${ category }()` } );

	}

	async _stageSelection( assign ) {

		const result = await ops.Cost.SelectedProducts();
		const products = result?.result ?? [];
		if ( ! products.length ) {

			this.form.setMessage( 'Select elements in the 3D view first (this model only).', 'error' );
			return;

		}

		const { add, remove } = this.draft.products;
		for ( const product of products ) {

			const label = product.name || product.type;
			if ( assign ) {

				remove.delete( product.guid );
				add.set( product.guid, label );

			} else {

				add.delete( product.guid );
				remove.set( product.guid, label );

			}

		}

		this.form.setMessage( `${ plural( products.length, 'element' ) } will be ${ assign ? 'added' : 'removed' } when you save.` );
		this._renderProducts();

	}

	_show() {

		ops.Cost.SelectItem( { item: this.item.id, isolate: false } );

	}

	// The operator calls Save makes, in order: attributes, rate, quantities,
	// values, elements.
	_steps() {

		const item = { item: this.item.id };
		const steps = [];
		const attributes = {};
		const text = ( input ) => input.getValue().trim();
		const set = ( key, value, old ) => {

			if ( value !== old ) attributes[ key ] = value;

		};

		set( 'Identification', text( this._identification ) || null, this.item.identification || null );
		set( 'Name', text( this._name ) || 'Unnamed', this.item.name || 'Unnamed' );
		set( 'Description', text( this._description ) || null, this.item.description || null );
		if ( Object.keys( attributes ).length ) steps.push( { label: 'rename the item', run: () => ops.Cost.EditCostItem( attributes, item ) } );

		const number = ( input, what ) => {

			const raw = input.getValue();
			const value = Number( raw );
			if ( raw === '' || ! Number.isFinite( value ) ) throw new Error( `The ${ what } must be a number.` );
			return value;

		};

		const quantities = this.draft.quantities;
		for ( const id of quantities.remove ) steps.push( { label: 'remove a quantity', run: () => ops.Cost.RemoveQuantity( id, item ) } );
		for ( const quantity of this.item.quantities ) {

			if ( quantities.remove.has( quantity.id ) ) continue;
			const value = number( this._quantityInputs.get( quantity.id ), `${ quantityLabel( quantity.type ).toLowerCase() } quantity` );
			if ( value !== quantity.value ) steps.push( { label: 'change a quantity', run: () => ops.Cost.EditQuantity( quantity.id, value, item ) } );

		}

		for ( const entry of quantities.add ) {

			const value = number( entry.input, `new ${ quantityLabel( entry.ifcClass ).toLowerCase() } quantity` );
			steps.push( { label: 'add a quantity', run: () => ops.Cost.AddQuantity( { ...item, ifcClass: entry.ifcClass, value } ) } );

		}

		const rateId = Number( this._rate.getValue() );
		if ( this._rateChanged && rateId ) {

			steps.push( { label: 'assign the rate', run: () => ops.Cost.AssignRate( rateId, item ) } );

		} else {

			const formula = ( input ) => {

				const value = input.getValue().trim();
				const check = ops.Cost.CheckFormula( value );
				if ( ! value || check.status === 'CANCELLED' ) throw new Error( `“${ value }” is not a rate: ${ check.message || 'it is empty.' }` );
				return value;

			};

			const values = this.draft.values;
			for ( const id of values.remove ) steps.push( { label: 'remove a rate', run: () => ops.Cost.RemoveValue( id, item ) } );
			for ( const value of this.item.values ) {

				if ( values.remove.has( value.id ) ) continue;
				const typed = formula( this._valueInputs.get( value.id ) );
				if ( typed !== value.formula ) steps.push( { label: 'change a rate', run: () => ops.Cost.EditValueFormula( value.id, typed, item ) } );

			}

			for ( const entry of values.add ) {

				const typed = formula( entry.input );
				steps.push( { label: 'add a rate', run: async () => {

					const added = await ops.Cost.AddValue( { ...item, type: entry.type, category: entry.category } );
					if ( added?.status === 'CANCELLED' || typed === entry.formula ) return added;
					return ops.Cost.EditValueFormula( added.result, typed, item );

				} } );

			}

		}

		const { add, remove } = this.draft.products;
		if ( remove.size ) steps.push( { label: 'remove elements', run: () => ops.Cost.UnassignProducts( { ...item, guids: [ ...remove.keys() ] } ) } );
		if ( add.size ) steps.push( { label: 'add elements', run: () => ops.Cost.AssignProducts( { ...item, guids: [ ...add.keys() ] } ) } );
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
			const fresh = ops.Cost.ItemDetails( { item: this.item.id } );
			if ( fresh?.result ) this._load( fresh.result );
			return false;

		}

		const saved = ops.Cost.ItemDetails( { item: this.item.id } ).result;
		this.onSaved?.( saved ? `Saved ${ itemLabel( saved ) }: ${ this._totalText( saved ).replace( /^Now: /, '' ) }` : 'Saved' );
		return true;

	}

	async _remove() {

		if ( ! await confirmItemRemoval( this.item ) ) return false;
		const result = await ops.Cost.RemoveCostItem( { item: this.item.id } );
		if ( result?.status === 'CANCELLED' ) {

			this.form.setMessage( result.message || 'The item could not be deleted.', 'error' );
			return false;

		}

		this.onSaved?.( `Deleted ${ itemLabel( this.item ) }` );
		return true;

	}

}

export function confirmItemRemoval( item ) {

	const what = itemLabel( item );
	return confirmDialog( {
		title: 'Delete cost item',
		message: item.hasChildren ? `Delete “${ what }” and all the items inside it?` : `Delete “${ what }”?`,
		detail: 'Its quantities, rates and element links go too. This cannot be undone, but nothing is written to disk until you save the project.',
		confirmLabel: item.hasChildren ? 'Delete all' : 'Delete',
	} );

}

// Name, kind and status of a cost schedule; or a new one.
export class CostScheduleDialog {

	constructor( { onSaved } ) {

		this.onSaved = onSaved;
		this.schedule = null;

		this.form = new FormDialog( {
			title: 'Cost schedule',
			icon: 'request_quote',
			width: '26rem',
			onSave: () => this._save(),
			onDelete: () => this._remove(),
			deleteLabel: 'Delete schedule',
		} );

		this._name = textInput( () => {}, { placeholder: 'e.g. Stage 3 cost plan' } );
		this._type = dropdownInput( SCHEDULE_TYPES, () => {} );
		this._status = suggestInput( `bonsai-cost-status-${ Math.random().toString( 36 ).slice( 2 ) }`, STATUSES, 'e.g. Draft' );
		this.form.body.add(
			field( 'Name', this._name ),
			row( field( 'Kind', this._type ), field( 'Status', this._status ) ),
			new Text( 'A schedule of rates holds unit rates that other schedules can use.' ).addClass( 'bonsai-dialog-note' ),
		);
		this.form.body.dom.append( this._status.list );

	}

	// schedule: { id, modelId, name, predefinedType, status }, or null for a new one.
	open( schedule ) {

		this.schedule = schedule;
		this.form.setTitle( schedule ? 'Cost schedule' : 'New cost schedule' );
		this.form.setDeleteHidden( ! schedule );
		this.form.setSaveLabel( schedule ? 'Save' : 'Create' );
		this._name.setValue( schedule?.name ?? 'Cost plan' );
		this._type.setValue( schedule?.predefinedType || 'COSTPLAN' );
		this._status.setValue( schedule?.status ?? '' );
		this.form.open();

	}

	async _save() {

		const name = this._name.getValue().trim() || 'Cost schedule';
		const predefinedType = this._type.getValue();
		const status = this._status.getValue().trim() || null;
		const schedule = this.schedule;
		let result;
		if ( ! schedule ) {

			result = await ops.Cost.AddCostSchedule( { name, predefinedType } );
			if ( result?.status !== 'CANCELLED' && status ) result = await ops.Cost.EditCostSchedule( { Status: status } );

		} else {

			const attributes = {};
			if ( name !== schedule.name ) attributes.Name = name;
			if ( predefinedType !== ( schedule.predefinedType || 'NOTDEFINED' ) ) attributes.PredefinedType = predefinedType;
			if ( status !== ( schedule.status || null ) ) attributes.Status = status;
			if ( ! Object.keys( attributes ).length ) return true;
			result = await ops.Cost.EditCostSchedule( attributes, { model: schedule.modelId, schedule: schedule.id } );

		}

		if ( result?.status === 'CANCELLED' ) {

			this.form.setMessage( result.message || 'The schedule could not be saved.', 'error' );
			return false;

		}

		this.onSaved?.( schedule ? `Saved ${ name }` : `Created ${ name }. Add its first item.` );
		return true;

	}

	async _remove() {

		const schedule = this.schedule;
		const ok = await confirmDialog( {
			title: 'Delete cost schedule',
			message: `Delete “${ schedule.name }” and all its items?`,
			detail: 'This cannot be undone, but nothing is written to disk until you save the project.',
			confirmLabel: 'Delete schedule',
		} );
		if ( ! ok ) return false;
		const result = await ops.Cost.RemoveCostSchedule( { model: schedule.modelId, schedule: schedule.id } );
		if ( result?.status === 'CANCELLED' ) {

			this.form.setMessage( result.message || 'The schedule could not be deleted.', 'error' );
			return false;

		}

		this.onSaved?.( `Deleted ${ schedule.name }` );
		return true;

	}

}

