import { FloatingDialog, InputList, LabeledBoxItem } from '@aeco-dev/gui';

/** Mount or remove a panel from its workspace. Does not open or close the region. */
export function setPanelMounted( panel, mounted ) {

	if ( ! panel ) return;
	if ( mounted ) {

		if ( ! panel.isVisible() ) panel.show( { open: false, select: false } );
		return;

	}

	if ( panel.isVisible() ) panel.hide( { closeIfEmpty: false } );

}

/**
 * One ribbon button opens a dialog listing every panel from the active modules.
 * Each checkbox mounts or dismounts that panel in its default workspace.
 */
export function bindPanelDialog( button, panels ) {

	const icons = { default: 'dock_to_right' };

	for ( const entry of panels ) {

		icons[ entry.spec.id ] = entry.spec.icon || icons.default;

	}

	const list = new InputList();
	const rows = [];

	for ( const entry of panels ) {

		const item = new LabeledBoxItem(
			{
				id: entry.spec.id,
				label: entry.spec.label,
				checked: entry.panel.isVisible(),
			},
			icons,
		);
		const input = item.dom.querySelector( 'input.Checkbox' );
		const apply = ( checked ) => setPanelMounted( entry.panel, checked );
		input?.addEventListener( 'change', () => apply( input.checked ) );
		item.dom.addEventListener( 'click', ( event ) => {

			if ( ! input || event.target === input ) return;
			input.checked = ! input.checked;
			apply( input.checked );

		} );
		list.add( item );
		rows.push( { input, panel: entry.panel } );

	}

	const dialog = new FloatingDialog( {
		title: 'Panels',
		icon: 'view_sidebar',
		panelStyles: { width: '16rem' },
	} );
	dialog.content( list );

	button?.addEventListener( 'click', () => {

		if ( ! dialog.isActive ) {

			for ( const row of rows ) {

				if ( row.input ) row.input.checked = row.panel.isVisible();

			}

		}

		dialog.toggle();

	} );

	return dialog;

}
