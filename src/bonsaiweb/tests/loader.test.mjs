// Tests for Loader + drag/drop pipeline. Mocks the Worker, the viewer,
// and window.showSaveFilePicker so we never touch wasm or a browser.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { Loader } from '../src/core/Loader.js';

// ---- Helpers --------------------------------------------------------

function createSignal() {
	const spy = { dispatch: ( payload ) => spy.calls.push( payload ), calls: [] };
	return spy;
}

function createSignals() {
	return {
		modelLoadStarted: createSignal(),
		modelLoaded: createSignal(),
		modelCleared: createSignal(),
		modelLoadedToGPU: createSignal(),
		modelUnloaded: createSignal(),
		modelNameChanged: createSignal(),
	};
}

function createViewer({ sidResult = 42 } = {}) {
	const calls = { addFile: [], addUrl: [], clearScene: 0, loadModel: [], unloadModel: [] };
	const modelLoadedCbs = [];
	return {
		calls,
		modelLoadedCbs,
		addFile: async ( file, opts ) => { calls.addFile.push({ file, opts }); return sidResult; },
		addUrl: async ( url, opts ) => { calls.addUrl.push({ url, opts }); return sidResult; },
		clearScene: () => { calls.clearScene += 1; },
		onModelLoaded: ( cb ) => { modelLoadedCbs.push( cb ); return () => {}; },
		loadModel: async ( sid ) => { calls.loadModel.push( sid ); return true; },
		unloadModel: ( sid ) => { calls.unloadModel.push( sid ); },
		modelCount: () => 0,
		modelProgress: () => 0,
		bytes: () => 0,
		stats: () => ({}),
		modelUnloaded: () => false,
		modelVramBytes: () => 0,
		setModelName: () => {},
	};
}

function makeLoader( viewer = createViewer(), signals = createSignals() ) {
	const viewport = { viewer, signals };
	return { loader: new Loader( viewport ), viewer, signals };
}

function createTarget() {
	const listeners = {};
	return {
		listeners,
		addEventListener( evt, fn ) { listeners[ evt ] = fn; },
	};
}

function installWindowMock( extra = {} ) {
	const listeners = {};
	globalThis.window = {
		addEventListener( evt, fn ) { ( listeners[ evt ] ||= [] ).push( fn ); },
		...extra,
	};
	return listeners;
}

function fakeDropEvent( file ) {
	let prevented = false;
	let stopped = false;
	return {
		get prevented() { return prevented; },
		get stopped() { return stopped; },
		dataTransfer: { files: file ? [ file ] : [] },
		preventDefault() { prevented = true; },
		stopPropagation() { stopped = true; },
	};
}

function installWorkerMock( handler ) {
	const instances = [];
	class FakeWorker {
		constructor( url, opts ) {
			this.url = url;
			this.opts = opts;
			this.onmessage = null;
			this.posted = [];
			instances.push( this );
		}
		postMessage( msg, transfer ) {
			this.posted.push({ msg, transfer });
			queueMicrotask( () => handler( this, msg ) );
		}
		terminate() {}
	}
	globalThis.Worker = FakeWorker;
	return instances;
}

function installSavePickerMock({ cancel = false } = {}) {
	const writes = [];
	const handle = {
		createWritable: async () => ({
			write: async ( data ) => writes.push( data ),
			close: async () => {},
		}),
		getFile: async () => new File( writes.flatMap( ( d ) => [ d ] ), 'saved.ifcview' ),
	};
	installWindowMock({
		showSaveFilePicker: async () => {
			if ( cancel ) throw new DOMException( 'cancelled', 'AbortError' );
			return handle;
		},
	});
	return { writes };
}

// Fallback (no showSaveFilePicker) needs these DOM-ish bits.
function installFallbackSaveMocks() {
	const anchors = [];
	globalThis.document = {
		createElement: ( tag ) => {
			if ( tag !== 'a' ) throw new Error( `unexpected tag ${ tag }` );
			const a = { tag, clicked: false, click() { this.clicked = true; } };
			anchors.push( a );
			return a;
		},
	};
	globalThis.URL.createObjectURL = () => 'blob:fake';
	globalThis.URL.revokeObjectURL = () => {};
	installWindowMock();
	return anchors;
}

// ---- Drop filtering -------------------------------------------------

test( 'drop ignores non-ifc extensions', async () => {
	const { loader, viewer } = makeLoader();
	const target = createTarget();
	loader.enableDragDrop( target );
	await target.listeners.drop( fakeDropEvent( new File( [ 'x' ], 'notes.txt' ) ) );
	assert.equal( viewer.calls.addFile.length, 0 );
} );

test( 'drop with no file is a no-op', async () => {
	const { loader, viewer } = makeLoader();
	const target = createTarget();
	loader.enableDragDrop( target );
	await target.listeners.drop( fakeDropEvent( null ) );
	assert.equal( viewer.calls.addFile.length, 0 );
} );

test( 'dragover/dragenter prevent default (needed for drop to fire)', () => {
	installWindowMock();
	const { loader } = makeLoader();
	const target = createTarget();
	loader.enableDragDrop( target );
	const over = fakeDropEvent( null );
	target.listeners.dragover( over );
	assert.equal( over.prevented, true );
	const enter = fakeDropEvent( null );
	target.listeners.dragenter( enter );
	assert.equal( enter.prevented, true );
} );

test( 'window dragover + drop handlers prevent the browser from navigating', () => {
	const winListeners = installWindowMock();
	const { loader } = makeLoader();
	loader.enableDragDrop( createTarget() );

	assert.ok( winListeners.dragover?.length, 'window dragover listener registered' );
	assert.ok( winListeners.drop?.length, 'window drop listener registered' );

	const stray = fakeDropEvent( new File( [ 'x' ], 'house.ifc' ) );
	for ( const fn of winListeners.dragover ) fn( stray );
	assert.equal( stray.prevented, true, 'dragover default (needed to arm drop) is swallowed' );

	const strayDrop = fakeDropEvent( new File( [ 'x' ], 'house.ifc' ) );
	for ( const fn of winListeners.drop ) fn( strayDrop );
	assert.equal( strayDrop.prevented, true, 'stray drops do not navigate the page' );
} );

test( 'drop outside the viewport does not reload or route to the viewer', async () => {
	const workers = installWorkerMock( () => assert.fail( 'should not convert strays' ) );
	const winListeners = installWindowMock();
	const { loader, viewer } = makeLoader();
	loader.enableDragDrop( createTarget() );

	// User misses #bonsai and drops on <body> — only the window handler fires.
	const stray = fakeDropEvent( new File( [ 'x' ], 'house.ifc' ) );
	for ( const fn of winListeners.drop ) fn( stray );

	assert.equal( stray.prevented, true );
	assert.equal( viewer.calls.addFile.length, 0 );
	assert.equal( workers.length, 0 );
} );

test( 'drop .ifcview streams directly to addFile without worker', async () => {
	const workers = installWorkerMock( () => {
		assert.fail( '.ifcview should not spawn the convert worker' );
	} );
	const { loader, viewer, signals } = makeLoader();
	const target = createTarget();
	loader.enableDragDrop( target );
	const file = new File( [ new Uint8Array([ 1, 2, 3 ]) ], 'model.ifcview' );
	await target.listeners.drop( fakeDropEvent( file ) );
	assert.equal( viewer.calls.addFile.length, 1 );
	assert.equal( viewer.calls.addFile[ 0 ].file, file );
	assert.deepEqual( viewer.calls.addFile[ 0 ].opts, { replace: false } );
	assert.equal( workers.length, 0 );
	assert.equal( signals.modelLoadStarted.calls[ 0 ]?.source, 'file' );
} );

// ---- Convert pipeline -----------------------------------------------

test( 'drop .ifc round-trips through worker and saves to disk', async () => {
	const sidecar = new Uint8Array([ 9, 8, 7, 6 ]);
	const workers = installWorkerMock( ( w, msg ) => {
		w.onmessage({ data: { id: msg.id, type: 'progress', progress: { phase: 'parsing', ratio: 0.1 } } });
		w.onmessage({ data: { id: msg.id, type: 'result', ok: true, sidecarBytes: sidecar } });
	} );
	const picker = installSavePickerMock();

	const { loader, viewer, signals } = makeLoader();
	const target = createTarget();
	loader.enableDragDrop( target );
	const file = new File( [ new Uint8Array([ 1, 2, 3, 4 ]) ], 'house.ifc' );
	await target.listeners.drop( fakeDropEvent( file ) );

	assert.equal( workers.length, 1, 'worker is spawned once' );
	const posted = workers[ 0 ].posted[ 0 ];
	assert.equal( posted.msg.filename, 'house.ifc' );
	assert.ok( posted.msg.bytes instanceof Uint8Array );
	assert.deepEqual( posted.transfer, [ posted.msg.bytes.buffer ] );

	assert.equal( picker.writes.length, 1, 'sidecar bytes written to disk' );
	assert.deepEqual( picker.writes[ 0 ], sidecar );

	assert.equal( viewer.calls.addFile.length, 1 );
	assert.deepEqual( viewer.calls.addFile[ 0 ].opts, { replace: false } );

	const progressDispatched = signals.modelLoadStarted.calls.find( ( p ) => p.source === 'convert' );
	assert.ok( progressDispatched, 'progress relayed to signals' );
	assert.equal( progressDispatched.phase, 'parsing' );
} );

test( 'drop .ifc falls back to anchor download when showSaveFilePicker missing', async () => {
	const sidecar = new Uint8Array([ 5, 5, 5 ]);
	installWorkerMock( ( w, msg ) => {
		w.onmessage({ data: { id: msg.id, type: 'result', ok: true, sidecarBytes: sidecar } });
	} );
	const anchors = installFallbackSaveMocks();

	const { loader, viewer } = makeLoader();
	const target = createTarget();
	loader.enableDragDrop( target );
	await target.listeners.drop( fakeDropEvent( new File( [ 'ifc' ], 'tower.IFC' ) ) );

	assert.equal( anchors.length, 1 );
	assert.equal( anchors[ 0 ].download, 'tower.ifcview' );
	assert.equal( anchors[ 0 ].clicked, true );
	assert.equal( viewer.calls.addFile.length, 1 );
	assert.equal( viewer.calls.addFile[ 0 ].file.name, 'tower.ifcview' );
} );

test( 'worker error rejects the drop pipeline', async () => {
	installWorkerMock( ( w, msg ) => {
		w.onmessage({ data: { id: msg.id, type: 'result', ok: false, error: 'boom' } });
	} );
	installSavePickerMock();

	const { loader, viewer } = makeLoader();
	const target = createTarget();
	loader.enableDragDrop( target );
	await assert.rejects(
		target.listeners.drop( fakeDropEvent( new File( [ 'x' ], 'bad.ifc' ) ) ),
		/boom/,
	);
	assert.equal( viewer.calls.addFile.length, 0 );
} );

test( 'convert worker is reused across multiple drops', async () => {
	const sidecar = new Uint8Array([ 1 ]);
	const workers = installWorkerMock( ( w, msg ) => {
		w.onmessage({ data: { id: msg.id, type: 'result', ok: true, sidecarBytes: sidecar } });
	} );
	installSavePickerMock();

	const { loader } = makeLoader();
	const target = createTarget();
	loader.enableDragDrop( target );
	await target.listeners.drop( fakeDropEvent( new File( [ 'a' ], 'a.ifc' ) ) );
	await target.listeners.drop( fakeDropEvent( new File( [ 'b' ], 'b.ifc' ) ) );
	assert.equal( workers.length, 1, 'single worker across drops' );
	assert.equal( workers[ 0 ].posted.length, 2 );
	assert.notEqual( workers[ 0 ].posted[ 0 ].msg.id, workers[ 0 ].posted[ 1 ].msg.id );
} );

// ---- Basic Loader surface ------------------------------------------

test( 'addFile dispatches modelLoadStarted and forwards to viewer', async () => {
	const { loader, viewer, signals } = makeLoader( createViewer({ sidResult: 7 }) );
	const file = new File( [ 'x' ], 'house.ifcview' );
	const sid = await loader.addFile( file, { name: 'House' } );
	assert.equal( sid, 7 );
	assert.equal( viewer.calls.addFile[ 0 ].file, file );
	assert.equal( signals.modelLoadStarted.calls[ 0 ].name, 'House' );
	assert.equal( signals.modelLoadStarted.calls[ 0 ].source, 'file' );
} );

test( 'clear() delegates to viewer and dispatches modelCleared', () => {
	const { loader, viewer, signals } = makeLoader();
	loader.clear();
	assert.equal( viewer.calls.clearScene, 1 );
	assert.equal( signals.modelCleared.calls.length, 1 );
} );

test( '_bind relays onModelLoaded through signals.modelLoaded', () => {
	const { loader, viewer, signals } = makeLoader();
	loader._bind();
	assert.equal( viewer.modelLoadedCbs.length, 1 );
	// ifcviewer.js hands us a detail object, not a bare id.
	viewer.modelLoadedCbs[ 0 ]({ sourceId: 123, sessionModelId: 7 });
	assert.deepEqual( signals.modelLoaded.calls[ 0 ], { sourceId: 123, sessionModelId: 7 } );
} );

test( '_bind tolerates a legacy numeric sourceId payload', () => {
	const { loader, viewer, signals } = makeLoader();
	loader._bind();
	viewer.modelLoadedCbs[ 0 ]( 42 );
	assert.deepEqual( signals.modelLoaded.calls[ 0 ], { sourceId: 42, sessionModelId: undefined } );
} );

// ---- loadIfcUrl (autoload) -----------------------------------------

function installFetchMock( handler ) {
	globalThis.fetch = async ( url ) => handler( url );
}

test( 'loadIfcUrl fetches, converts in worker, streams through addFile', async () => {
	const ifcBytes = new Uint8Array([ 0xAA, 0xBB, 0xCC ]);
	const sidecar = new Uint8Array([ 1, 2, 3, 4, 5 ]);
	installFetchMock( async ( url ) => {
		assert.match( url, /window_wall\.ifc$/ );
		return { ok: true, status: 200, arrayBuffer: async () => ifcBytes.buffer };
	} );
	const workers = installWorkerMock( ( w, msg ) => {
		assert.equal( msg.filename, 'window_wall.ifc' );
		w.onmessage({ data: { id: msg.id, type: 'result', ok: true, sidecarBytes: sidecar } });
	} );

	const { loader, viewer, signals } = makeLoader();
	await loader.loadIfcUrl( 'http://x/app/files/ifc/window_wall.ifc' );

	assert.equal( workers.length, 1, 'autoload uses the worker' );
	assert.equal( viewer.calls.addFile.length, 1 );
	assert.equal( viewer.calls.addFile[ 0 ].file.name, 'window_wall.ifcview' );
	assert.deepEqual( viewer.calls.addFile[ 0 ].opts, { replace: false } );
	assert.equal( signals.modelLoadStarted.calls[ 0 ].source, 'autoload' );
} );

test( 'loadIfcUrl is additive — two drops leave both models in the scene', async () => {
	const sidecar = new Uint8Array([ 7, 7 ]);
	installWorkerMock( ( w, msg ) => {
		w.onmessage({ data: { id: msg.id, type: 'result', ok: true, sidecarBytes: sidecar } });
	} );
	installFetchMock( async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([ 1 ]).buffer }) );

	const { loader, viewer } = makeLoader();
	await loader.loadIfcUrl( 'http://x/a.ifc' );
	await loader.loadIfcUrl( 'http://x/b.ifc' );

	assert.equal( viewer.calls.clearScene, 0, 'additive loads must never clear the scene' );
	assert.equal( viewer.calls.addFile.length, 2 );
	for ( const call of viewer.calls.addFile ) {
		assert.equal( call.opts.replace, false, 'addFile must use replace:false' );
	}
} );

test( 'loadIfcUrl with .ifcview URL skips the worker', async () => {
	const bytes = new Uint8Array([ 7, 7, 7 ]);
	installFetchMock( async () => ({ ok: true, arrayBuffer: async () => bytes.buffer }) );
	const workers = installWorkerMock( () => assert.fail( '.ifcview URL should not convert' ) );

	const { loader, viewer } = makeLoader();
	await loader.loadIfcUrl( 'http://x/model.ifcview' );

	assert.equal( workers.length, 0 );
	assert.equal( viewer.calls.addFile.length, 1 );
	assert.equal( viewer.calls.addFile[ 0 ].file.name, 'model.ifcview' );
} );

test( 'loadIfcUrl rejects on failed fetch', async () => {
	installFetchMock( async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer( 0 ) }) );
	installWorkerMock( () => assert.fail( 'should not reach worker on fetch error' ) );
	const { loader } = makeLoader();
	await assert.rejects( loader.loadIfcUrl( 'http://x/missing.ifc' ), /404/ );
} );
