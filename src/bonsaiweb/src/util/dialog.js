// This file was generated with the assistance of an AI coding tool.
//
// Dialogs shared by the schedule sheets (bim.sequence, bim.cost): a form
// that changes nothing until Save, and a confirmation for deletes.

import { Button, FloatingDialog, StackPanel, Text } from '@aeco-dev/gui';

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
