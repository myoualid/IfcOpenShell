import ops from '../ops.js';
import terminal from './code.terminal/operators.js';
import dropbox from './dropbox/operators.js';
import georeferencing from './georeferencing/operators.js';
import profiling from './profiling/operators.js';
import project from './project/operators.js';
import properties from './properties/operators.js';
import settings from './settings/operators.js';
import spatial from './spatial-hierarchy/operators.js';
import viewer from './viewer/operators.js';

/** Module id → operator classes. Order is the headless registration order. */
export const operatorModules = new Map( [
	[ 'project', project ],
	[ 'dropbox', dropbox ],
	[ 'settings', settings ],
	[ 'georeferencing', georeferencing ],
	[ 'spatial-hierarchy', spatial ],
	[ 'properties', properties ],
	[ 'viewer', viewer ],
	[ 'profiling', profiling ],
	[ 'code.terminal', terminal ],
] );

export function registerOperators( configs ) {

	const list = configs ?? [ ...operatorModules.keys() ].map( ( id ) => ( { id, active: true } ) );
	for ( const item of list ) {

		if ( item.active === false ) continue;
		const operators = operatorModules.get( item.id );
		if ( ! operators ) throw new Error( `bonsai: unknown module "${ item.id }"` );
		for ( const Op of operators ) ops.register( Op );

	}

}
