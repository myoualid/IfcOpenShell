// This file was generated with the assistance of an AI coding tool.
//
// DOM helpers shared by the schedule sheets (bim.sequence, bim.cost).

import { Button, Checkbox, Control, InputDropdown, InputText, Operator as IconButton, StackPanel, Text } from '@aeco-dev/gui';

export function plural( count, word ) {

	return `${ count } ${ word }${ count === 1 ? '' : 's' }`;

}

export function element( tag, className, textContent ) {

	const node = document.createElement( tag );
	if ( className ) node.className = className;
	if ( textContent ) node.textContent = textContent;
	return node;

}

export function iconButton( icon, label, onClick ) {

	const button = new IconButton( icon );
	button.dom.title = label;
	button.dom.setAttribute( 'aria-label', label );
	button.dom.setAttribute( 'role', 'button' );
	button.onClick( ( event ) => {

		event.preventDefault();
		onClick();

	} );
	return button;

}

export function setDropdown( dropdown, options, value ) {

	const select = dropdown.dom;
	select.replaceChildren( ...options.map( ( option ) => {

		const node = element( 'option', '', option.label );
		node.value = option.value;
		return node;

	} ) );
	select.value = value;

}

function workspaceClosed( panel ) {

	const layout = panel.layout;
	return typeof layout?.isWorkspaceOpen === 'function' && ! layout.isWorkspaceOpen( panel.position );

}

// Show a docked panel: open its workspace when that is closed, and bring
// its tab to the front.
export function showPanel( panel ) {

	if ( ! panel ) return;
	if ( ! panel.isVisible() || workspaceClosed( panel ) ) panel.show( { open: true, select: true } );
	else panel.select();

}

// Hide only what is on screen: a panel can be visible and selected in a
// closed workspace, and then the button should open it.
export function togglePanel( panel ) {

	if ( ! panel ) return;
	if ( panel.isVisible() && panel.isSelected() && ! workspaceClosed( panel ) ) panel.hide( { closeIfEmpty: true } );
	else showPanel( panel );

}

// Follow signals.panelToggled for one panel spec id: { id, show } shows
// (true), hides (false) or toggles (left out) the docked panel that
// `getPanel` returns. Operators dispatch it; panels never call each other.
export function bindPanelToggle( signals, id, getPanel ) {

	signals.panelToggled.add( ( request ) => {

		if ( request?.id !== id ) return;
		const panel = getPanel();
		if ( ! panel ) return;
		if ( request.show === true ) showPanel( panel );
		else if ( request.show === false ) panel.hide( { closeIfEmpty: true } );
		else togglePanel( panel );

	} );

}

// EDITORS — form controls for the schedule editors. Inputs commit on change
// (Enter or leaving the field), not on every keystroke.

export function textButton( label, icon, onClick ) {

	const button = new Button( label );
	if ( icon ) button.setIcon( icon );
	button.dom.type = 'button';
	button.addClass( 'bonsai-sheet-button' );
	button.onClick( ( event ) => {

		event.preventDefault();
		onClick();

	} );
	return button;

}

// A labelled row: the label above the control.
export function field( label, control ) {

	const caption = new Text( label ).addClass( 'bonsai-sheet-field-label' );
	return new StackPanel( { isVertical: true } ).addClass( 'bonsai-sheet-field' ).add( caption, control );

}

export function textInput( onCommit, { type = 'text', placeholder = '' } = {} ) {

	const input = new InputText( '' );
	input.dom.type = type;
	if ( placeholder ) input.dom.placeholder = placeholder;
	input.dom.addEventListener( 'change', () => onCommit( input.getValue() ) );
	return input;

}

export function dropdownInput( options, onCommit ) {

	const dropdown = new InputDropdown();
	setDropdown( dropdown, options.map( ( value ) => ( typeof value === 'string' ? { value, label: value } : value ) ), '' );
	dropdown.onChange( () => onCommit( dropdown.getValue() ) );
	return dropdown;

}

export function checkboxInput( label, onCommit ) {

	const box = new Checkbox( false );
	box.dom.addEventListener( 'change', () => onCommit( box.getValue() ) );
	// A <label>, so clicking the text toggles the box too.
	const row = new Control( element( 'label', 'bonsai-sheet-check' ) );
	row.dom.append( box.dom, element( 'span', '', label ) );
	row.box = box;
	return row;

}
