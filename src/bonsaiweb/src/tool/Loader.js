// Loader — model lifecycle: adding sources, dropping them, and the
// bookkeeping that goes with it (counts, progress, VRAM, names).

import * as ifcopenshell from 'ifcopenshell';
import { createLogger } from '../util/log.js';
import { readZipEntriesByExtension } from '../pipeline/zip.js';
import { Ifc } from './Ifc.js';
import { fromRoot } from '../root.js';
import { viewer } from '../viewer/host.js';

const log = createLogger( 'loader' );

let ifcRuntime = null;
// Startup values come from configuration.geometry via Loader.configure().
const convertDefaults = { engine: 'ifc-lite', kernel: 'opencascade', thread: 'worker' };
const CONVERT_WORKERS = {
	'ifc-lite': 'src/pipeline/worker-lite.js',
	ifcopenshell: 'src/pipeline/worker.js',
};
const THREADS = [ 'worker', 'main' ];
const convertWorkers = new Map();
let convertWorkerSeq = 0;
const convertWorkerPending = new Map();
// Sidecars this session built from an .ifc. Keyed by viewer sourceId.
const sidecarCache = new Map();

export class Loader {

	// ---- Conversion settings ----------------------------------------
	// { engine, kernel, thread }. The load methods below also read these
	// keys from their options/hooks argument to override them per call.

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
		for ( const key of [ 'engine', 'kernel', 'thread' ] ) {

			if ( options?.[ key ] != null ) picked[ key ] = options[ key ];

		}

		return picked;

	}

	static _validateConvertOptions( { engine, thread } ) {

		if ( ! CONVERT_WORKERS[ engine ] ) {

			throw new Error( `unknown geometry engine "${ engine }" (expected ${ Object.keys( CONVERT_WORKERS ).join( ' | ' ) })` );

		}

		if ( ! THREADS.includes( thread ) ) {

			throw new Error( `unknown convert thread "${ thread }" (expected ${ THREADS.join( ' | ' ) })` );

		}

	}

	// ---- Add / remove sources ---------------------------------------

	// Returns the sourceId (valid immediately, before streaming completes).
	// Geometry is additive: the viewer's embedded sample and any already
	// streamed models stay. A live .ifc is opened beside its .ifcview
	// (see _pairLiveIfc). Pass `{ replace: true }` to drop the scene first.
	static async addFile( file, options ) {

		const opts = { ...options };
		if ( opts.replace ) {

			Ifc.clear();
			sidecarCache.clear();

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
	// scene, then open the live IFC against that same source.
	static async _pairLiveIfc( liveBytes, ifcName, sidecarBytes, hooks ) {

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

		await Loader._openLive( sourceId, liveBytes, ifcName, hooks );
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

	static async addUrl( url, options ) {

		const sourceId = await viewer.addUrl( url, options );
		const name = String( url ).split( '/' ).pop()?.split( '?' )[ 0 ] ?? '';
		if ( name.toLowerCase().endsWith( '.ifcview' ) ) Ifc.setView( sourceId, name );
		return sourceId;

	}

	static clear() {

		viewer.clearScene();
		Ifc.clear();
		sidecarCache.clear();

	}

	// ---- Model bookkeeping ------------------------------------------

	static count() {

		return viewer.modelCount();

	}
	static progress( index ) {

		return viewer.modelProgress( index );

	}
	static bytes() {

		return viewer.bytes();

	}
	static stats() {

		return viewer.stats();

	}

	// Unloading frees GPU buffers but keeps the model in the scene.
	static async load( sourceId ) {

		const ok = await viewer.loadModel( sourceId );
		return ok;

	}
	static unload( sourceId ) {

		viewer.unloadModel( sourceId );

	}
	static isUnloaded( sourceId ) {

		return viewer.modelUnloaded( sourceId );

	}
	static vramBytes( sourceId ) {

		return viewer.modelVramBytes( sourceId );

	}

	static setName( sourceId, name ) {

		viewer.setModelName( sourceId, name );

	}

	// ---- OPFS cache --------------------------------------------------

	static cacheInfo() {

		return viewer.cacheInfo();

	}
	static clearCache( url ) {

		return viewer.clearCache( url );

	}

	// ---- Events ------------------------------------------------------

	static onLoaded( cb ) {

		return viewer.onModelLoaded( cb );

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

			const sidecarBytes = await Loader._convert( bytes, file.name, hooks );
			return Loader._pairLiveIfc( liveBytes, file.name, sidecarBytes, hooks );

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

			const sidecarBytes = await Loader._convert( ifcEntry.bytes, ifcEntry.entry.name, hooks );
			return Loader._pairLiveIfc( liveBytes, ifcName, sidecarBytes, hooks );

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
		const sidecarBytes = await Loader._convert( bytes, name, options );
		log.log( `converter returned sidecar (${ sidecarBytes.byteLength } bytes)` );
		return Loader._pairLiveIfc( liveBytes, name, sidecarBytes, options );

	}

	// Resolve once the viewer finishes streaming+first-rendering the
	// model. Also resolves (false) if modelCleared fires first, so stale
	// listeners don't leak.
	static _awaitModelLoaded( sourceId ) {

		return new Promise( ( resolve ) => {

			const detach = () => {

				s.modelLoaded.remove( onLoaded );
				s.modelCleared.remove( onCleared );

			};

			const onLoaded = ( payload ) => {

				const paySid = typeof payload === 'number' ? payload : payload?.sourceId;
				if ( paySid !== sourceId ) return;
				detach();
				resolve( true );

			};

			const onCleared = () => {

				detach();
				resolve( false );

			};

			s.modelLoaded.add( onLoaded );
			s.modelCleared.add( onCleared );

		} );

	}

	// Open the live IFC on the main thread and promote that source to edit
	// mode, so tool.Ifc / tool.Element can resolve picks to full entities.
	// The sidecar for this source is already registered as view mode.
	//
	// Same sequence as threejs.html: read FILE_SCHEMA from the first 4KB,
	// lowercase it, load that schema plugin, then open. `open` is synchronous
	// and fails if the plugin is not loaded yet.
	static async openIfcFile( sourceId, bytes, name ) {

		try {

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

			const file = ifcopenshell.open( bytes, name );
			log.log( `live IFC opened for source ${ sourceId } (${ name }, ${ schema })` );
			Ifc.setEdit( sourceId, file, name );
			const data = bytes instanceof Uint8Array ? bytes : new Uint8Array( bytes );
			Loader._remember( sourceId, {
				ifc: { name, bytes: data.byteLength, data },
			} );
			return file;

		} catch ( err ) {

			log.error( `live IFC open failed for ${ name }:`, err );

		}

	}

	static async _openLive( sourceId, bytes, name, hooks ) {

		const file = await Loader.openIfcFile( sourceId, bytes, name );
		if ( file ) hooks?.onLiveIfc?.( { sourceId, name, file } );
		return file;

	}

	// One worker per engine, spawned on first use and reused afterwards.
	static _getConvertWorker( engine ) {

		let convertWorker = convertWorkers.get( engine );
		if ( ! convertWorker ) {

			const workerUrl = fromRoot( CONVERT_WORKERS[ engine ] );
			log.log( `spawning convert worker (engine=${ engine }):`, workerUrl.href );
			convertWorker = new Worker( workerUrl, { type: 'module' } );
			convertWorkers.set( engine, convertWorker );
			convertWorker.onmessage = ( ev ) => {

				const { id, type } = ev.data;
				const pending = convertWorkerPending.get( id );
				if ( ! pending ) return;
				if ( type === 'progress' ) {

					pending.onConvertProgress?.( ev.data.progress );

				} else if ( type === 'result' ) {

					convertWorkerPending.delete( id );
					if ( ev.data.ok ) pending.resolve( ev.data.sidecarBytes );
					else pending.reject( new Error( ev.data.error || 'Conversion failed' ) );

				}

			};

			// A worker that fails to load its module graph fires 'error'
			// once and never answers postMessage — reject pending promises.
			convertWorker.onerror = ( ev ) => {

				const detail = ev?.error?.stack || ev?.error?.message || ev?.message || 'worker failed';
				const msg = `convert worker error: ${ detail }`;
				log.error( msg, ev );
				for ( const [ id, pending ] of convertWorkerPending ) {

					if ( pending.worker !== convertWorker ) continue;
					convertWorkerPending.delete( id );
					pending.reject( new Error( msg ) );

				}

				// A worker that has already faulted will not answer the next
				// postMessage. Drop it so the following load starts a new one.
				convertWorkers.delete( engine );

			};

			convertWorker.onmessageerror = ( ev ) => {

				log.error( 'convert worker messageerror:', ev );

			};

		}

		return convertWorker;

	}

	// Resolves to .ifcview bytes. `bytes` is transferred to the worker, so
	// callers that still need the IFC must keep their own copy.
	static async _convert( bytes, filename, hooks ) {

		const { engine, kernel, thread } = Loader.convertOptions( hooks );
		if ( engine === 'ifcopenshell' && thread === 'worker' ) {

			throw new Error( 'engine "ifcopenshell" needs thread "main": the CDN package resolves through the page import map, which workers do not get' );

		}

		if ( thread === 'main' ) {

			const { convertBytes } = await import( fromRoot( 'src/pipeline/main-thread.js' ).href );
			const result = await convertBytes( bytes, filename, {
				engine,
				kernel,
				onProgress: hooks?.onConvertProgress,
			} );
			return result.sidecarBytes;

		}

		const worker = Loader._getConvertWorker( engine );
		const id = ++ convertWorkerSeq;
		return new Promise( ( resolve, reject ) => {

			convertWorkerPending.set( id, {
				worker,
				resolve,
				reject,
				onConvertProgress: hooks?.onConvertProgress,
			} );
			worker.postMessage( { id, bytes, filename, kernel }, [ bytes.buffer ] );

		} );

	}

}

export default Loader;
