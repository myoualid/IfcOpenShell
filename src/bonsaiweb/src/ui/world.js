import { Layout, World } from '@aeco-dev/layout';

/**
 * Region ids must stay stable. Layout looks up RibbonMenu, HeaderBar,
 * RibbonBar, WorkspaceLeft/Right, WorkspaceBottom, Viewport, Footer,
 * and LayoutToggleBar.
 */
export function mountShell( container, ui ) {

	const world = new World( ui.WorldComponent );
	world.root.addClass( 'World' );
	world.mount( container );

	const layout = new Layout( ui.layout ).init( world );
	return {
		world,
		layout,
		viewport: world.dom.querySelector( '#Viewport' ),
		footer: world.dom.querySelector( '#Footer' ),
	};

}

export function createWorkspacePanel( layout, options, body ) {

	const panel = new Layout.Panel( {
		layout,
		position: options.position,
		group: options.group,
		id: options.id,
		label: options.label,
		icon: options.icon,
		title: options.title,
		floatable: true,
		autoShow: options.autoShow !== false,
		panelStyles: options.panelStyles,
	} );
	if ( body ) panel.add( body.addClass( 'bonsai-panel-body' ) );
	return panel;

}
