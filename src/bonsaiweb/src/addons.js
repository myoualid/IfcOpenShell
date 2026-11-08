import { operatorModules } from './modules/operators.js';
import ops from './ops.js';

/**
 * An addon is a module that lives outside this package. The page lists them in
 * `configuration.app.Addons`:
 *
 *   {
 *     id: 'cde-sync',
 *     operators: [ SaveIfc ],                  // Operator classes, `Category.Name`
 *     ui: [ CdePanel ],                        // panel classes, mounted by the Shell
 *     ribbon: { workModes: [], buttons: [] },  // merged into the Shell's ribbon
 *     active: true,                            // false skips it
 *   }
 *
 * Bonsai registers the operators. Headless pages never read `ui` or `ribbon`.
 */
export function registerAddons( addons = [] ) {

	const active = [];
	const ids = new Set();
	for ( const addon of addons ?? [] ) {

		if ( addon?.active === false ) continue;
		const id = addon?.id;
		if ( ! id ) throw new Error( 'bonsai: an addon needs an id' );
		if ( operatorModules.has( id ) ) throw new Error( `bonsai: addon "${ id }" uses a built-in module id` );
		if ( ids.has( id ) ) throw new Error( `bonsai: addon "${ id }" is listed twice` );
		ids.add( id );
		for ( const Op of addon.operators ?? [] ) ops.register( Op );
		active.push( addon );

	}

	return active;

}

function appendToRibbonBar( node, groups ) {

	if ( node.type === 'RibbonBar' ) return { ...node, children: [ ...( node.children ?? [] ), ...groups ] };
	if ( ! node.children ) return node;
	return { ...node, children: node.children.map( ( child ) => appendToRibbonBar( child, groups ) ) };

}

/**
 * The Shell configuration with every addon's ribbon groups and work modes
 * appended. The page's own configuration is not changed.
 */
export function withAddonRibbon( configuration, addons = [] ) {

	const groups = addons.flatMap( ( addon ) => addon.ribbon?.buttons ?? [] );
	const modes = addons.flatMap( ( addon ) => addon.ribbon?.workModes ?? [] );
	if ( groups.length === 0 && modes.length === 0 ) return configuration;

	const { ribbon, ui } = configuration;
	// Two addons may add groups to the same new work mode; it gets one tab.
	const workModes = [ ...ribbon.workModes ];
	for ( const mode of modes ) {

		if ( ! workModes.some( ( item ) => item.id === mode.id ) ) workModes.push( mode );

	}

	return {
		...configuration,
		ui: { ...ui, WorldComponent: appendToRibbonBar( ui.WorldComponent, groups ) },
		ribbon: { ...ribbon, workModes, buttons: [ ...ribbon.buttons, ...groups ] },
	};

}
