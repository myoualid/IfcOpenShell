// Loader — model lifecycle: adding sources, dropping them, and the
// bookkeeping that goes with it (counts, progress, VRAM, names).

import { createLogger } from '../util/log.js';
import { readZipEntriesByExtension } from '../pipeline/zip.js';
import { resolveThread, THREADS } from '../pipeline/thread.js';
import { createIfcOpenShellWorker, shimUrlFrom } from '../pipeline/worker-host.js';
import { Ifc } from './Ifc.js';
import { viewer } from './Viewer.js';

const log = createLogger( 'loader' );

let ifcRuntime = null;
// Startup values come from configuration.geometry via Loader.configure().
const convertDefaults = { kernel: 'opencascade', thread: 'worker' };
// Resolved from the bundle in build/, not from this source file. The pipeline
// stays an unbundled source file.
const PACKAGE_ROOT = new URL( '../', import.meta.url );
const CONVERT_WORKER = 'src/pipeline/worker.js';
let convertWorker = null;
let convertWorkerSeq = 0;
const convertWorkerPending = new Map();
// Sidecars this session built from an .ifc. Keyed by viewer sourceId.
const sidecarCache = new Map();

export class Loader {

	// ---- Conversion settings ----------------------------------------
	// { kernel, thread }. The load methods below also read these keys from
	// their options/hooks argument to override them per call.

	static configure( options = {} ) {

		const next = { ...convertDefaults, ...Loader._pickConvertOptions( options ) };
		Loader._validateConvertOptions( next );
		Object.assign( convertDefaults, next );
		return Loader.convertOptions();

	}

	static convertOptions( overrides = {} ) {

		const opts = { ...convertDefaults, ...Loader._pickConvertOptions( overrides ) };
		Loader._validateConvertOptions( opts );
		return opts;

	}

	static _pickConvertOptions( options ) {

		const picked = {};
		for ( const key of [ 'kernel', 'thread' ] ) {

			if ( options?.[ key ] != null ) picked[ key ] = options[ key ];

		}

		return picked;

	}

	static _validateConvertOptions( { thread } ) {

		if ( ! THREADS.includes( thread ) ) resolveThread( thread );

	}

	// Pre-load the live-file schema and spawn the convert worker after
	// appReady, so the first model does not pay those cold starts on the
	// interaction path. One worker at a time: parallel plugin loads contend.
	static warmRuntimes() {

		const idle = globalThis.requestIdleCallback
			?? ( ( callback ) => setTimeout( callback, 1 ) );
		// One runtime at a time: parallel schema plugin loads contend.
		idle( () => {

			void Loader._warmMainSchema().then( () => Loader._warmConvertWorker() );

		} );

	}

	static async _warmMainSchema() {

		try {

			const ifcopenshell = await import( 'ifcopenshell' );
			ifcRuntime ??= await ifcopenshell.init();
			if ( ! ifcRuntime.loadedPlugins().includes( 'schema:ifc4' ) ) {

				log.log( 'pre-warming main-thread schema:ifc4' );
				await ifcRuntime.loadPlugin( 'schema', 'ifc4' );

			}

		} catch ( err ) {

			log.warn( 'main-thread schema warm failed:', err );

		}

	}

	static async _warmConvertWorker() {

		const { kernel } = convertDefaults;
		try {

			const worker = Loader._getConvertWorker();
			const id = ++ convertWorkerSeq;
			await new Promise( ( resolve, reject ) => {

				convertWorkerPending.set( id, { worker, resolve, reject } );
				worker.postMessage( { id, type: 'warm', kernel } );

			} );
			log.log( `convert worker warmed (kernel=${ kernel })` );

		} catch ( err ) {

			log.warn( 'convert worker warm failed:', err );

		}

	}

	// ---- Add / remove sources ---------------------------------------

	// Returns the sourceId (valid immediately, before streaming completes).
	// Geometry is additive: the viewer's embedded sample and any already
	// streamed models stay. A live .ifc is opened beside its .ifcview
	// (see _pairLiveIfc). Pass `{ replace: true }` to drop the scene first.
	static async addFile( file, options ) {

		const opts = { ...options };
		// First user model replaces the viewer's embedded sample. Otherwise
		// that sample keeps the camera and false origin, and streamed IFC
		// geometry lands off-screen.
		if ( opts.replace || ! Ifc.get() ) {

			Ifc.clear();
			sidecarCache.clear();
			opts.replace = true;

		}

		const sourceId = await viewer.addFile( file, opts );
		const name = file?.name;
		if ( typeof name === 'string' && name.toLowerCase().endsWith( '.ifcview' ) ) {

			Ifc.setView( sourceId, name );
			Loader._remember( sourceId, {
				view: { name, bytes: file.size, file },
			} );

		}

		return sourceId;

	}

	static _sidecarName( ifcName ) {

		return String( ifcName ).replace( /\.ifc$/i, '.ifcview' );

	}

	// Source already in the scene for this IFC (matching .ifcview or .ifc).
	static _sourceIdBeside( ifcName ) {

		const sidecar = Loader._sidecarName( ifcName );
		return Ifc.get( sidecar )?.sourceId ?? Ifc.get( ifcName )?.sourceId ?? null;

	}

	// Stream sidecar geometry only when this model is not already in the
	// scene, then attach a live IFC that may already be opening.
	static async _pairLiveIfc( liveBytes, ifcName, sidecarBytes, hooks, liveTask ) {

		const file = sidecarBytes instanceof File
			? sidecarBytes
			: new File( [ sidecarBytes ], Loader._sidecarName( ifcName ) );
		let sourceId = Loader._sourceIdBeside( ifcName );
		if ( sourceId == null ) {

			sourceId = await Loader.addFile( file, { replace: false } );

		}

		if ( sourceId != null ) {

			Loader._remember( sourceId, {
				view: { name: file.name, bytes: file.size, file },
			} );

		}

		await Loader._attachLive( sourceId, liveBytes, ifcName, hooks, liveTask );
		return sourceId;

	}

	static _canStream() {

		// The JS helpers exist, but the current wasm does not export
		// ifcv_begin/append/end_stream_c. Feeding parts through
		// load_ifcview_from_source_c leaves the camera on an empty scene.
		const native = viewer?.module?._ifcv_begin_stream_c
			&& viewer?.module?._ifcv_append_part_c
			&& viewer?.module?._ifcv_end_stream_c;
		return Boolean( native );

	}

	static _startStream( ifcName ) {

		if ( ! Ifc.get() ) viewer.clearScene();
		const sidecarName = Loader._sidecarName( ifcName );
		const sourceId = viewer.beginStream( { name: sidecarName } );
		Ifc.setView( sourceId, sidecarName );
		return sourceId;

	}

	static async _finishStream( sourceId, ifcName, sidecarBytes ) {

		const file = sidecarBytes instanceof File
			? sidecarBytes
			: new File( [ sidecarBytes ], Loader._sidecarName( ifcName ) );
		Loader._remember( sourceId, {
			view: { name: file.name, bytes: file.size, file },
		} );
		// Parts are the session geometry. If none flushed (a tiny model), load
		// the final sidecar as part 0.
		const stream = viewer._streams?.get?.( sourceId );
		if ( ! stream?.parts?.length ) await viewer.appendPart( sourceId, file );
		viewer.endStream( sourceId );
		return sourceId;

	}

	// Bytes kept so a project row can save the .ifc, the .ifcview, or both.
	// { sourceId, ifc: { name, bytes, data } | null, view: { name, bytes, file } | null }
	static bundle( sourceId ) {

		return sidecarCache.get( sourceId ) ?? null;

	}

	static _remember( sourceId, patch ) {

		const row = sidecarCache.get( sourceId ) ?? { sourceId, ifc: null, view: null };
		Object.assign( row, patch );
		sidecarCache.set( sourceId, row );
		return row;

	}

	static async saveFile( file ) {

		if ( ! file ) return;
		const ext = file.name.match( /\.[^.]+$/ )?.[ 0 ]?.toLowerCase() ?? '';
		const kinds = {
			'.ifc': [ 'IFC', { 'application/octet-stream': [ '.ifc' ] } ],
			'.ifcview': [ 'IFC view', { 'application/octet-stream': [ '.ifcview' ] } ],
			'.zip': [ 'Zip archive', { 'application/zip': [ '.zip' ] } ],
		};
		try {

			if ( typeof window !== 'undefined' && window.showSaveFilePicker ) {

				const kind = kinds[ ext ];
				const handle = await window.showSaveFilePicker( {
					suggestedName: file.name,
					types: kind ? [ { description: kind[ 0 ], accept: kind[ 1 ] } ] : undefined,
				} );
				const writable = await handle.createWritable();
				await writable.write( file );
				await writable.close();
				return;

			}

			const anchor = document.createElement( 'a' );
			const url = URL.createObjectURL( file );
			anchor.href = url;
			anchor.download = file.name;
			anchor.click();
			setTimeout( () => URL.revokeObjectURL( url ), 0 );

		} catch ( err ) {

			if ( err?.name === 'AbortError' ) return;
			log.error( `save failed for ${ file.name }:`, err );

		}

	}

	static clear() {

		viewer?.clearScene();
		Ifc.clear();
		sidecarCache.clear();

	}

	// ---- Local file load (picker and drag & drop share this path) ----
	// .ifc     → if that model is already in the scene, just open the
	//            live IFC beside it; otherwise convert → cache → stream.
	//            The .ifcview stays in sidecarCache until the user saves it.
	// .ifcview → stream directly (no-op if already loaded).
	// .zip     → look for a pre-baked (.ifc, .ifcview) pair inside.
	static async loadLocalFile( file, hooks ) {

		if ( ! file ) return null;
		try {

			const lower = file.name.toLowerCase();
			if ( lower.endsWith( '.ifcview' ) ) {

				const existing = Ifc.get( file.name )?.sourceId;
				if ( existing != null ) return existing;
				return Loader.addFile( file, { replace: false } );

			}

			if ( lower.endsWith( '.zip' ) ) {

				return Loader._dropZipBundle( file, hooks );

			}

			if ( ! lower.endsWith( '.ifc' ) ) {

				log.log( `loadLocalFile skipped unsupported type: ${ file.name }` );
				return null;

			}

			const bytes = new Uint8Array( await file.arrayBuffer() );
			// Keep a main-thread copy before postMessage transfers the buffer.
			const liveBytes = bytes.slice();
			const existing = Loader._sourceIdBeside( file.name );
			if ( existing != null ) {

				await Loader._openLive( existing, liveBytes, file.name, hooks );
				return existing;

			}

			return Loader._convertAndPair( bytes, liveBytes, file.name, hooks );

		} catch ( err ) {

			log.error( `loadLocalFile failed for ${ file.name }:`, err );
			throw err;

		}

	}

	// ---- Drag & drop -------------------------------------------------
	static enableDragDrop( target, onFile ) {

		const stop = ( e ) => {

			e.preventDefault(); e.stopPropagation();

		};

		// Without a window-level preventDefault, a drop that lands outside
		// the viewport navigates the page to the file.
		const win = ( typeof window !== 'undefined' ) ? window : null;
		if ( win ) {

			win.addEventListener( 'dragover', ( e ) => e.preventDefault() );
			win.addEventListener( 'drop', ( e ) => e.preventDefault() );

		}

		target.addEventListener( 'dragover', stop );
		target.addEventListener( 'dragenter', stop );
		target.addEventListener( 'drop', async ( e ) => {

			stop( e );
			const file = e.dataTransfer?.files?.[ 0 ];
			if ( ! file ) return;
			onFile?.( file );

		} );

	}

	// Handle a dropped `.zip` by looking inside for a (.ifc, .ifcview) pair.
	// Fast path: the .ifcview streams straight into the viewer; the .ifc
	// feeds openIfcFile so ifcopenshell can resolve picks to entities.
	static async _dropZipBundle( zipFile, hooks ) {

		const zipBytes = new Uint8Array( await zipFile.arrayBuffer() );

		let found;
		try {

			found = await readZipEntriesByExtension( zipBytes, [ '.ifcview', '.ifc' ] );

		} catch ( err ) {

			log.error( `zip read failed for ${ zipFile.name }:`, err );
			throw err;

		}

		const ifcview = found.find( ( f ) => f.entry.name.toLowerCase().endsWith( '.ifcview' ) );
		const ifcEntry = found.find( ( f ) => f.entry.name.toLowerCase().endsWith( '.ifc' ) );

		if ( ! ifcview && ! ifcEntry ) {

			throw new Error( `zip ${ zipFile.name } contains neither .ifcview nor .ifc` );

		}

		if ( ! ifcview && ifcEntry ) {

			const ifcName = ifcEntry.entry.name.split( '/' ).pop();
			log.log( `zip ${ zipFile.name } has only ${ ifcEntry.entry.name } — converting via worker` );
			const liveBytes = ifcEntry.bytes.slice();
			const existing = Loader._sourceIdBeside( ifcName );
			if ( existing != null ) {

				await Loader._openLive( existing, liveBytes, ifcName, hooks );
				return existing;

			}

			return Loader._convertAndPair( ifcEntry.bytes, liveBytes, ifcName, hooks );

		}

		const sidecarName = ifcview.entry.name.split( '/' ).pop();
		const ifcName = ifcEntry?.entry.name.split( '/' ).pop();
		const existing = ( ifcName && Loader._sourceIdBeside( ifcName ) )
			?? Ifc.get( sidecarName )?.sourceId;
		if ( existing != null ) {

			if ( ifcEntry ) await Loader._openLive( existing, ifcEntry.bytes, ifcName, hooks );
			return existing;

		}

		log.log( `zip ${ zipFile.name } fast path: streaming ${ sidecarName } (${ ifcview.bytes.byteLength } bytes)` );
		const sourceId = await Loader.addFile(
			new File( [ ifcview.bytes ], sidecarName ), { replace: false },
		);

		if ( ifcEntry ) {

			await Loader._openLive( sourceId, ifcEntry.bytes, ifcName, hooks );

		} else {

			log.log( `zip ${ zipFile.name } has no .ifc — properties panel will stay sidecar-only` );

		}

		return sourceId;

	}

	// Fetch an .ifc URL, convert in the worker, stream the result. Used
	// for autoload / tests — no save prompt.
	static async loadIfcUrl( url, options = {} ) {

		const res = await fetch( url );
		if ( ! res.ok ) throw new Error( `fetch ${ url } failed: ${ res.status }` );
		const bytes = new Uint8Array( await res.arrayBuffer() );
		log.log( `fetched ${ bytes.byteLength } bytes` );
		const name = options.name ?? url.split( '/' ).pop() ?? 'model.ifc';
		if ( /\.ifcview$/i.test( name ) ) {

			const existing = Ifc.get( name )?.sourceId;
			if ( existing != null ) return existing;
			return Loader.addFile( new File( [ bytes ], name ), { replace: false } );

		}

		const liveBytes = bytes.slice();
		const existing = Loader._sourceIdBeside( name );
		if ( existing != null ) {

			await Loader._openLive( existing, liveBytes, name, options );
			return existing;

		}

		log.log( 'handing off to converter…' );
		return Loader._convertAndPair( bytes, liveBytes, name, options );

	}

	// Open the live IFC on the main thread and promote that source to edit
	// mode, so tool.Ifc / tool.Element can resolve picks to full entities.
	// The sidecar for this source is already registered as view mode.
	//
	// Same sequence as threejs.html: read FILE_SCHEMA from the first 4KB,
	// lowercase it, load that schema plugin, then open. `open` is synchronous
	// and fails if the plugin is not loaded yet.
	static async openIfcFile( sourceId, bytes, name ) {

		const file = await Loader._parseLiveIfc( bytes, name );
		if ( ! file ) return;
		log.log( `live IFC opened for source ${ sourceId } (${ name })` );
		Ifc.setEdit( sourceId, file, name );
		const data = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
		Loader._remember( sourceId, {
			ifc: { name, bytes: data.byteLength, data },
		} );
		return file;

	}

	// Open the STEP file without a viewer source yet, so the live parse can
	// run in parallel with conversion. Callers then `_attachLive`.
	static async _parseLiveIfc( bytes, name ) {

		try {

			// Not a top-level import: see tool/Ifc.js.
			const ifcopenshell = await import( 'ifcopenshell' );
			ifcRuntime ??= await ifcopenshell.init();
			const stream = ifcRuntime.raw.parse.streamFromString(
				new TextDecoder().decode( bytes.slice( 0, 4096 ) ),
			);
			let header, declaration, schema;
			try {

				header = stream.header();
				declaration = header.fileSchema();
				schema = declaration.schemaIdentifiers()[ 0 ].toLowerCase();

			} finally {

				declaration?.destroy();
				header?.destroy();
				stream.destroy();

			}

			if ( ! ifcRuntime.loadedPlugins().includes( `schema:${ schema }` ) ) {

				log.log( `loading schema plugin ${ schema }` );
				await ifcRuntime.loadPlugin( 'schema', schema );

			}

			return ifcopenshell.open( bytes, name );

		} catch ( err ) {

			log.error( `live IFC open failed for ${ name }:`, err );

		}

	}

	static async _attachLive( sourceId, bytes, name, hooks, liveTask ) {

		const file = liveTask
			? await liveTask
			: await Loader.openIfcFile( sourceId, bytes, name );
		if ( ! file ) return null;
		if ( liveTask ) {

			Ifc.setEdit( sourceId, file, name );
			const data = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
			Loader._remember( sourceId, {
				ifc: { name, bytes: data.byteLength, data },
			} );

		}

		hooks?.onLiveIfc?.( { sourceId, name, file } );
		return file;

	}

	static async _openLive( sourceId, bytes, name, hooks ) {

		return Loader._attachLive( sourceId, bytes, name, hooks );

	}

	// Convert, optionally stream parts into a federated source, and attach
	// the live IFC. The live parse starts immediately so it overlaps conversion.
	static async _convertAndPair( bytes, liveBytes, ifcName, hooks ) {

		const liveTask = Loader._parseLiveIfc( liveBytes, ifcName );
		const streaming = Loader._canStream();
		const sourceId = streaming ? Loader._startStream( ifcName ) : null;
		const convertHooks = streaming
			? {
				...hooks,
				onPart: async ( partBytes ) => {

					await viewer.appendPart( sourceId, partBytes );

				},
			}
			: hooks;
		let sidecarBytes;
		try {

			sidecarBytes = await Loader._convert( bytes, ifcName, convertHooks );
			log.log( `converter returned sidecar (${ sidecarBytes.byteLength } bytes)` );

		} catch ( err ) {

			if ( streaming && sourceId != null ) {

				try {

					viewer.endStream( sourceId );

				} catch { /* source may already be gone */ }

			}

			throw err;

		}

		if ( streaming ) {

			await Loader._finishStream( sourceId, ifcName, sidecarBytes );
			await Loader._attachLive( sourceId, liveBytes, ifcName, hooks, liveTask );
			return sourceId;

		}

		return Loader._pairLiveIfc( liveBytes, ifcName, sidecarBytes, hooks, liveTask );

	}

	// Spawned on first use and reused afterwards.
	static _getConvertWorker() {

		if ( convertWorker ) return convertWorker;

		const workerUrl = new URL( CONVERT_WORKER, PACKAGE_ROOT );
		log.log( 'spawning convert worker:', workerUrl.href );
		// ifcopenshell imports bare specifiers. The page import map does not
		// apply to a module worker, so conversion boots through a classic
		// worker that installs the same map. The wasm URLs match the page,
		// and the browser reuses the cached modules.
		const worker = createIfcOpenShellWorker( workerUrl.href, { shimUrl: shimUrlFrom( PACKAGE_ROOT ) } );
		convertWorker = worker;
		worker.onmessage = ( ev ) => {

			const { id, type } = ev.data;
			const pending = convertWorkerPending.get( id );
			if ( ! pending ) return;
			if ( type === 'progress' ) {

				pending.onConvertProgress?.( ev.data.progress );

			} else if ( type === 'part' ) {

				pending.partChain = ( pending.partChain ?? Promise.resolve() )
					.then( () => pending.onPart?.( ev.data.bytes ) )
					.catch( ( err ) => log.error( 'onPart failed:', err ) );

			} else if ( type === 'warmed' ) {

				convertWorkerPending.delete( id );
				if ( ev.data.ok ) pending.resolve?.( ev.data );
				else pending.reject?.( new Error( ev.data.error || 'Convert worker warm failed' ) );

			} else if ( type === 'result' ) {

				convertWorkerPending.delete( id );
				const finish = () => {

					if ( ev.data.ok ) {

						pending.resolve( ev.data );

					} else if ( ev.data.fatal ) {

						// The wasm trapped: its heap is suspect, so this worker
						// must not take another job.
						const err = new Error( ev.data.error || 'Conversion crashed' );
						err.fatal = true;
						err.bytes = ev.data.bytes;
						pending.reject( err );
						Loader._dropConvertWorker( worker, `convert worker crashed: ${ err.message }` );

					} else {

						pending.reject( new Error( ev.data.error || 'Conversion failed' ) );

					}

				};

				if ( pending.partChain ) pending.partChain.then( finish, finish );
				else finish();

			}

		};

		// A worker that fails to load its module graph fires 'error'
		// once and never answers postMessage — reject pending promises.
		worker.onerror = ( ev ) => {

			const detail = ev?.error?.stack || ev?.error?.message || ev?.message || 'worker failed';
			const msg = `convert worker error: ${ detail }`;
			log.error( msg, ev );
			Loader._dropConvertWorker( worker, msg );

		};

		worker.onmessageerror = ( ev ) => {

			log.error( 'convert worker messageerror:', ev );

		};

		return worker;

	}

	// A faulted worker will not answer the next postMessage. Reject what it
	// still owes, terminate it, and let the following load spawn a new one.
	static _dropConvertWorker( worker, reason ) {

		for ( const [ id, pending ] of convertWorkerPending ) {

			if ( pending.worker !== worker ) continue;
			convertWorkerPending.delete( id );
			pending.reject( new Error( reason ) );

		}

		if ( convertWorker === worker ) convertWorker = null;
		worker.terminate();

	}

	// Resolves to .ifcview bytes. `bytes` is transferred to the worker, so
	// callers that still need the IFC must keep their own copy.
	static async _convert( bytes, filename, hooks ) {

		const result = await Loader._convertDetailed( bytes, filename, hooks );
		return result.sidecarBytes;

	}

	// Time one IFC → .ifcview conversion without streaming it. Headless:
	// `await bonsai.tool.Loader.benchmark(file, { kernel: 'manifold' })`.
	// `input` is a File, a URL string, or IFC bytes. The caller's buffer is not transferred.
	static async benchmark( input, options = {} ) {

		const { bytes, filename } = await Loader._benchmarkInput( input, options );
		const wallStart = performance.now();
		const result = await Loader._convertDetailed( bytes.slice(), filename, options );
		const wallMs = performance.now() - wallStart;
		const report = {
			filename,
			kernel: result.kernel,
			thread: result.thread,
			numThreads: result.numThreads,
			ifcBytes: bytes.byteLength,
			sidecarBytes: result.sidecarBytes?.byteLength ?? 0,
			meshCount: result.meshCount ?? 0,
			productCount: result.productCount ?? 0,
			timings: result.timings ?? null,
			wallMs,
		};
		if ( options.keepSidecar ) report.sidecar = result.sidecarBytes;
		const phases = report.timings
			? ` init ${ report.timings.initMs.toFixed( 0 ) }ms tessellate ${ report.timings.tessellateMs.toFixed( 0 ) }ms serialize ${ report.timings.serializeMs.toFixed( 0 ) }ms`
			: '';
		log.log(
			`benchmark ${ filename } ${ report.kernel } ${ report.thread } ×${ report.numThreads ?? 1 }: wall ${ wallMs.toFixed( 0 ) }ms${ phases }, sidecar ${ report.sidecarBytes } bytes`,
		);
		return report;

	}

	static async _benchmarkInput( input, options ) {

		if ( typeof input === 'string' ) {

			const res = await fetch( input );
			if ( ! res.ok ) throw new Error( `fetch ${ input } failed: ${ res.status }` );
			return {
				bytes: new Uint8Array( await res.arrayBuffer() ),
				filename: options.filename ?? input.split( '/' ).pop() ?? 'model.ifc',
			};

		}

		if ( typeof File !== 'undefined' && input instanceof File ) {

			return {
				bytes: new Uint8Array( await input.arrayBuffer() ),
				filename: input.name,
			};

		}

		const bytes = input instanceof Uint8Array ? input : new Uint8Array( input );
		return { bytes, filename: options.filename ?? 'model.ifc' };

	}

	static async _convertDetailed( bytes, filename, hooks ) {

		const { kernel, thread: requested } = Loader.convertOptions( hooks );
		const thread = resolveThread( requested );
		// The converter clamps this against the runtime's thread support.
		const numThreads = hooks?.numThreads;
		log.log( `convert ${ filename } kernel=${ kernel } thread=${ thread } (${ bytes.byteLength } bytes)` );

		if ( thread === 'main' ) {

			const { convertBytes } = await import( new URL( 'src/pipeline/main-thread.js', PACKAGE_ROOT ).href );
			const result = await convertBytes( bytes, filename, {
				kernel,
				numThreads,
				settings: hooks?.settings,
				exclude: hooks?.exclude,
				onProgress: hooks?.onConvertProgress,
				onPart: hooks?.onPart,
			} );
			return {
				sidecarBytes: result.sidecarBytes,
				meshCount: result.meshCount ?? 0,
				productCount: result.productCount ?? 0,
				timings: result.timings ?? null,
				numThreads: result.numThreads ?? numThreads,
				kernel,
				thread,
			};

		}

		let usedKernel = kernel;
		let message;
		try {

			message = await Loader._convertInWorker( kernel, bytes, filename, numThreads, hooks );

		} catch ( err ) {

			// A crashing kernel (manifold on some files) gets one retry with
			// OpenCASCADE on a fresh worker. Callers can opt out.
			const fallback = 'opencascade';
			if ( ! err.fatal || ! err.bytes || kernel === fallback || hooks?.retryKernel === false ) throw err;
			log.warn( `kernel ${ kernel } crashed on ${ filename } (${ err.message }); retrying with ${ fallback }` );
			usedKernel = fallback;
			hooks?.onConvertRetry?.( { kernel: fallback, reason: err.message } );
			message = await Loader._convertInWorker( fallback, err.bytes, filename, numThreads, hooks );

		}

		return {
			sidecarBytes: message.sidecarBytes,
			meshCount: message.meshCount ?? 0,
			productCount: message.productCount ?? 0,
			timings: message.timings ?? null,
			numThreads: message.numThreads ?? numThreads,
			kernel: usedKernel,
			thread,
		};

	}

	static _convertInWorker( kernel, bytes, filename, numThreads, hooks ) {

		const worker = Loader._getConvertWorker();
		const id = ++ convertWorkerSeq;
		return new Promise( ( resolve, reject ) => {

			convertWorkerPending.set( id, {
				worker,
				resolve,
				reject,
				onConvertProgress: hooks?.onConvertProgress,
				onPart: hooks?.onPart,
			} );
			const payload = {
				id,
				bytes,
				filename,
				kernel,
				numThreads,
				settings: hooks?.settings,
				exclude: hooks?.exclude,
				streamParts: typeof hooks?.onPart === 'function',
			};
			worker.postMessage( payload, [ bytes.buffer ] );

		} );

	}

}

export default Loader;
