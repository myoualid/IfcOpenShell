import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { registerAddons, withAddonRibbon } from '../src/addons.js';
import { context } from '../src/context/context.js';
import ops, { Operator } from '../src/ops.js';

class CountModels extends Operator {

	static operatorName = 'AddonTest.CountModels';

	execute() {

		return { status: 'FINISHED', result: 3 };

	}

}

class Skipped extends Operator {

	static operatorName = 'AddonTest.Skipped';

}

const group = { id: 'RG_AddonTest', name: 'Addon', type: 'RibbonGroup', workMode: 'Site', children: [] };

function configuration() {

	const buttons = [ { id: 'RG_Project', name: 'Project', type: 'RibbonGroup', workMode: 'Project', children: [] } ];
	return {
		ui: {
			WorldComponent: {
				id: 'World',
				type: 'World',
				children: [
					{ id: 'RibbonMenu', type: 'Workspace', children: [ { id: 'RibbonBar', type: 'RibbonBar', children: buttons } ] },
					{ id: 'Viewport', type: 'Workspace' },
				],
			},
		},
		ribbon: { workModes: [ { id: 'Project', name: 'Project' } ], defaultWorkMode: 'Project', buttons },
	};

}

describe( 'addons', () => {

	it( 'registers the operators of active addons only', () => {

		const active = registerAddons( [
			{ id: 'addon-test', operators: [ CountModels ] },
			{ id: 'addon-off', operators: [ Skipped ], active: false },
		] );

		assert.deepEqual( active.map( ( addon ) => addon.id ), [ 'addon-test' ] );
		assert.equal( ops.AddonTest.CountModels().result, 3 );
		assert.equal( ops.execute( 'AddonTest.CountModels', context ).result, 3 );
		assert.equal( ops.registry.has( 'AddonTest.Skipped' ), false );

	} );

	it( 'rejects a missing id, a built-in id and a duplicate', () => {

		assert.throws( () => registerAddons( [ { operators: [] } ] ), /needs an id/ );
		assert.throws( () => registerAddons( [ { id: 'viewer' } ] ), /built-in/ );
		assert.throws( () => registerAddons( [ { id: 'twice' }, { id: 'twice' } ] ), /twice/ );

	} );

	it( 'appends addon ribbon groups and work modes without changing the page config', () => {

		const page = configuration();
		const addons = [
			{ id: 'a', ribbon: { workModes: [ { id: 'Site', name: 'Site' } ], buttons: [ group ] } },
			{ id: 'b', ribbon: { workModes: [ { id: 'Site', name: 'Site' }, { id: 'Project', name: 'Project' } ] } },
		];
		const merged = withAddonRibbon( page, addons );

		assert.deepEqual( merged.ribbon.workModes.map( ( mode ) => mode.id ), [ 'Project', 'Site' ] );
		assert.deepEqual( merged.ribbon.buttons.map( ( item ) => item.id ), [ 'RG_Project', 'RG_AddonTest' ] );
		const bar = merged.ui.WorldComponent.children[ 0 ].children[ 0 ];
		assert.deepEqual( bar.children.map( ( item ) => item.id ), [ 'RG_Project', 'RG_AddonTest' ] );

		assert.equal( page.ribbon.buttons.length, 1 );
		assert.equal( page.ui.WorldComponent.children[ 0 ].children[ 0 ].children.length, 1 );
		assert.equal( withAddonRibbon( page, [ { id: 'c' } ] ), page );

	} );

} );
