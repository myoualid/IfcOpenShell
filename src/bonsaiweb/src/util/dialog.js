// This file was generated with the assistance of an AI coding tool.
//
// Dialogs shared by the schedule sheets (bim.sequence, bim.cost): a form
// that changes nothing until Save, and a confirmation for deletes.

import { Button, Container, FloatingDialog, StackPanel, Text } from '@aeco-dev/gui';

import { element, iconButton, plural, textInput } from './sheet.js';

function button( label, className, onClick ) {

	const node = new Button( label );
	node.dom.type = 'button';
	if ( className ) node.addClass( className );
	node.onClick( ( event ) => {

		event.preventDefault();
		onClick();

	} );
	return node;

}

// A form in a floating dialog. Edits stay in the form until Save, which
// calls `onSave()`: it returns true to close, or false to stay open (it
// shows why with setMessage). `onDelete`, when given, adds a Delete button
// on the left of the footer.
export class FormDialog {

	constructor( { title, icon = 'edit', width = '30rem', saveLabel = 'Save', note = '', onSave, onDelete = null, deleteLabel = 'Delete' } ) {

		this.onSave = onSave;
		this.onDelete = onDelete;
		this._busy = false;

		this.dialog = new FloatingDialog( { title, icon, panelStyles: { width, maxHeight: 'calc(100vh - 4rem)' } } );
		this.dialog.addClass( 'bonsai-dialog' );

		this.body = new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-body' );
		this._message = new Text( '' ).addClass( 'bonsai-dialog-message' );
		this._note = new Text( note ).addClass( 'bonsai-dialog-note' );
		this.dialog.content( this.body, this._message );

		this._save = button( saveLabel, 'primary', () => this.save() );
		this._delete = onDelete ? button( deleteLabel, 'bonsai-dialog-danger', () => this._remove() ) : null;
		const spacer = new Text( '' ).addClass( 'bonsai-dialog-spacer' );
		this.dialog.footer( [ this._delete, this._note, spacer, button( 'Cancel', 'secondary', () => this.close() ), this._save ] );

		this.dialog.dom.addEventListener( 'keydown', ( event ) => {

			// Keys stay in the dialog, away from the sheet and the viewer.
			event.stopPropagation();
			if ( event.key === 'Escape' ) {

				event.preventDefault();
				this.close();

			} else if ( event.key === 'Enter' && ( event.ctrlKey || event.metaKey || event.target.tagName === 'INPUT' ) && event.target.type !== 'button' ) {

				event.preventDefault();
				this.save();

			}

		} );

	}

	get isOpen() {

		return Boolean( this.dialog.isActive );

	}

	setTitle( title ) {

		this.dialog.setTitle( title );
		return this;

	}

	setSaveLabel( label ) {

		this._save.setValue( label );
		return this;

	}

	setDeleteHidden( hidden ) {

		this._delete?.setHidden( hidden );
		return this;

	}

	// tone: '' (neutral), 'error'.
	setMessage( text, tone = '' ) {

		this._message.setValue( text || '' );
		this._message.dom.classList.toggle( 'is-error', tone === 'error' );
		return this;

	}

	open() {

		this.setMessage( '' );
		this.dialog.show();
		this.body.dom.querySelector( 'input:not([type=checkbox]), select, textarea' )?.focus();
		return this;

	}

	close() {

		this.dialog.hide();
		return this;

	}

	async save() {

		if ( this._busy ) return;
		this._busy = true;
		this._save.dom.disabled = true;
		try {

			if ( await this.onSave() ) this.close();

		} catch ( error ) {

			this.setMessage( error?.message || String( error ), 'error' );

		} finally {

			this._busy = false;
			this._save.dom.disabled = false;

		}

	}

	async _remove() {

		if ( this._busy ) return;
		if ( await this.onDelete() ) this.close();

	}

}

// Ask before something that cannot be undone. Resolves true on confirm;
// Cancel, Escape and closing resolve false. Cancel has the focus.
export function confirmDialog( { title, message, detail = '', confirmLabel = 'Delete', icon = 'delete' } ) {

	return new Promise( ( resolve ) => {

		let answered = false;
		const dialog = new FloatingDialog( { title, icon, panelStyles: { width: '24rem' } } );
		dialog.addClass( 'bonsai-dialog' );
		const body = new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-body' ).add( new Text( message ).addClass( 'bonsai-dialog-question' ) );
		if ( detail ) body.add( new Text( detail ).addClass( 'bonsai-dialog-note' ) );
		dialog.content( body );

		const answer = ( value ) => {

			if ( answered ) return;
			answered = true;
			dialog.hide();
			dialog.dom.remove();
			resolve( value );

		};

		const cancel = button( 'Cancel', 'secondary', () => answer( false ) );
		dialog.footer( [ cancel, button( confirmLabel, 'bonsai-dialog-danger', () => answer( true ) ) ] );
		dialog.onHide = () => answer( false );
		dialog.dom.addEventListener( 'keydown', ( event ) => {

			event.stopPropagation();
			if ( event.key === 'Escape' ) answer( false );

		} );
		dialog.show();
		cancel.dom.focus();

	} );

}

// FORM PARTS

// 'NOTDEFINED' → 'Not defined', 'CONSTRUCTION' → 'Construction'.
export function enumLabel( value ) {

	const words = { NOTDEFINED: 'Not defined', USERDEFINED: 'User defined', NOTSTARTED: 'Not started' };
	if ( words[ value ] ) return words[ value ];
	return value.charAt( 0 ) + value.slice( 1 ).toLowerCase();

}

export function section( title, ...children ) {

	return new StackPanel( { isVertical: true } ).addClass( 'bonsai-dialog-section' ).add(
		new Text( title ).addClass( 'bonsai-dialog-heading' ),
		...children,
	);

}

export function row( ...children ) {

	return new StackPanel( { isVertical: false } ).addClass( 'bonsai-dialog-row' ).add( ...children );

}

// A text input that suggests values, still taking any text.
export function suggestInput( id, values, placeholder ) {

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

// One list line: label, a muted detail, and one action button.
export function listLine( label, detail, { state, action, after } ) {

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
