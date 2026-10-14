import * as ifcopenshell from 'ifcopenshell';

import { loadDependencies } from './dependencies.js';
import { createLogger } from '../util/log.js';

const log = createLogger( 'bonsai' );
const ms = ( start ) => `${ ( performance.now() - start ).toFixed( 0 ) }ms`;

export async function loadRuntime( { gui = false } = {} ) {

	await loadDependencies( { gui } );

}

export async function initIfc() {

	await ifcopenshell.init();

}

export async function bootRuntime( { gui = false } = {} ) {

	const tBoot = performance.now();
	await loadRuntime( { gui } );
	log.log( `boot: dependencies loaded in ${ ms( tBoot ) }` );
	const tDeps = performance.now();
	await initIfc();
	log.log( `boot: ifcopenshell.init in ${ ms( tDeps ) }` );
	return tBoot;

}
