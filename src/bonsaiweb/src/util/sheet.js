// This file was generated with the assistance of an AI coding tool.
//
// DOM helpers shared by the schedule sheets (bim.sequence, bim.cost).

import { Operator as IconButton } from '@aeco-dev/gui';

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
