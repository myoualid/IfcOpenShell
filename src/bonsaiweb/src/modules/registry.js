import { operatorModules } from './ops.js';
import { bindProject } from './project/operators.js';
import { bindViewer } from './viewer/operators.js';

const bindModule = new Map( [
	[ 'project', bindProject ],
	[ 'viewer', bindViewer ],
] );

export function registerOperators( bonsai, configs ) {

	const list = configs ?? [ ...operatorModules.keys() ].map( ( id ) => ( { id, active: true } ) );
	for ( const item of list ) {

		if ( item.active === false ) continue;
		const operators = operatorModules.get( item.id );
		if ( ! operators ) throw new Error( `bonsai: unknown module "${ item.id }"` );
		for ( const Op of operators ) bonsai.ops.register( Op );
		bindModule.get( item.id )?.( bonsai );

	}

}
