import terminal from './code.terminal/operators.js';
import project from './project/operators.js';
import properties from './properties/operators.js';
import spatial from './spatial-hierarchy/operators.js';
import viewer from './viewer/operators.js';

/** Module id → operator classes. Order is the headless registration order. */
export const operatorModules = new Map( [
	[ 'project', project ],
	[ 'spatial-hierarchy', spatial ],
	[ 'properties', properties ],
	[ 'viewer', viewer ],
	[ 'code.terminal', terminal ],
] );
