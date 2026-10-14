// Keyboard — global keyboard shortcuts wired to bonsai commands.
// Skips shortcuts when focus is inside a text input.

export function bindKeyboard( bonsai ) {

	document.addEventListener( 'keydown', ( e ) => {

		const tag = document.activeElement?.tagName;
		if ( tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable ) return;

		if ( e.ctrlKey && ! e.shiftKey && e.key === 'z' ) {

			e.preventDefault();
			bonsai.undo();

		} else if ( e.ctrlKey && e.key === 'y' ) {

			e.preventDefault();
			bonsai.redo();

		}

	} );

}
