// Main-thread counterpart of worker.js. Built to dist/convert-main.js so the
// host bundle can import it by URL without pulling the pipeline into itself.

import { createLogger } from '../util/log.js';

const log = createLogger( 'convert-main' );

let ready = null;

export async function convertBytes( bytes, filename, { kernel, numThreads, settings, exclude, onProgress, onPart } ) {

	ready ??= import( './ifcopenshell/convert.js' );
	const pipeline = await ready;
	log.log( `${ filename } (kernel=${ kernel })` );
	return pipeline.convertBytes( bytes, filename, { kernel, numThreads, settings, exclude, onProgress, onPart } );

}
