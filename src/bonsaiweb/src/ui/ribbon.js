import { TabView } from '@aeco-dev/gui';

/**
 * Show the ribbon buttons for one work mode.
 */
export function bindRibbon( bonsai, ribbon ) {

	const buttons = [];

	for ( const spec of ribbon.buttons ) {

		const el = document.getElementById( spec.id );
		if ( ! el ) continue;
		el.type = 'button';
		if ( spec.workMode ) el.dataset.workMode = spec.workMode;

		if ( spec.operator ) {

			const args = spec.args ?? [];
			el.addEventListener( 'click', () => {

				void bonsai.ops.execute( spec.operator, ...args );

			} );

		}

		buttons.push( { el, workMode: spec.workMode } );

	}

	const bar = document.getElementById( 'WorkModeBar' );
	const workModes = new TabView();
	workModes.setId( 'RibbonWorkModes' );
	workModes.addClass( 'RibbonWorkModes' );

	for ( const mode of ribbon.workModes ) {

		workModes.addTab( mode.id, mode.name, [] );
		const tab = workModes.tabs.find( ( item ) => item.dom.id === mode.id );
		tab?.onClick( () => setWorkMode( mode.id ) );

	}

	workModes.panelsDiv.dom.style.display = 'none';
	bar?.appendChild( workModes.dom );

	function setWorkMode( id ) {

		bonsai.workMode = id;

		for ( const button of buttons ) {

			const hidden = Boolean( button.workMode ) && button.workMode !== id;
			button.el.classList.toggle( 'is-work-mode-hidden', hidden );

		}

		if ( workModes.selected !== id ) workModes.select( id );

	}

	bonsai.setWorkMode = setWorkMode;
	setWorkMode( ribbon.defaultWorkMode );

}
