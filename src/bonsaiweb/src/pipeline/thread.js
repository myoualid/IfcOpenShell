// IFC → .ifcview thread choice. IfcOpenShell converts in a worker by default:
// a single iterator.next() can block the main thread for 100 ms or more, and
// a crashing kernel would otherwise poison the runtime that holds live files.
// `main` stays available as an explicit choice (same path as threejs.html).

export const THREADS = [ 'auto', 'worker', 'main' ];

export function resolveThread( thread ) {

	if ( thread === 'worker' || thread === 'main' ) return thread;
	if ( thread !== 'auto' ) {

		throw new Error( `unknown convert thread "${ thread }" (expected ${ THREADS.join( ' | ' ) })` );

	}

	return 'worker';

}

// Native iterator threads need a pthreads build of the wasm, which in turn
// needs cross-origin isolation (SharedArrayBuffer). The current build has no
// pthreads, and `numThreads > 1` throws there, so the count is 1 unless the
// runtime reports thread support. Explicit requests are clamped the same way.
export function resolveNumThreads( requested, env = globalThis, threadsSupported = false ) {

	if ( ! threadsSupported || ! env.crossOriginIsolated ) return 1;
	const cores = Math.max( 1, Math.min( env.navigator?.hardwareConcurrency || 1, 8 ) );
	const count = Number( requested );
	if ( Number.isInteger( count ) && count > 0 ) return Math.min( count, cores );
	return cores;

}
