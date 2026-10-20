// Loader — model lifecycle: adding sources, dropping them, and the
// bookkeeping that goes with it (counts, progress, VRAM, names).

import { createLogger } from '../util/log.js';
import { listZipEntries, readZipEntriesByExtension, readZipEntry } from '../pipeline/zip.js';
import { resolveThread, THREADS } from '../pipeline/thread.js';
import { dependencyUrls } from '../../app/configuration/imports.js';
import { createIfcOpenShellWorker } from '../pipeline/worker-host.js';
import { Ifc } from './Ifc.js';
import { viewer } from './Viewer.js';
import {
	Federation,
	bagFromEntries,
	basename,
	isProjectPath,
	isStepBytes,
	lookupFile,
	parseIfcfed,
	sidecarPath,
	textOf,
	viewerTransform,
} from './federation.js';

const log = createLogger( 'loader' );

let ifcRuntime = null;
// Startup values come from configuration.geometry via Loader.configure().
const DELIVERIES = [ 'stream', 'end' ];
const convertDefaults = { kernel: 'opencascade', thread: 'worker', delivery: 'stream' };
// esbuild writes these next to the bundle in dist/. The names are split so
// esbuild does not treat them as assets of this source file.
const CONVERT_WORKER_URL = new URL( './convert-' + 'worker.js', import.meta.url );
const CONVERT_MAIN_URL = new URL( './convert-' + 'main.js', import.meta.url );
let paths = null;
let convertWorker = null;
let convertWorkerPromise = null;
let convertWorkerSeq = 0;
const convertWorkerPending = new Map();
// Sidecars this session built from an .ifc. Keyed by viewer sourceId.
const sidecarCache = new Map();

export class Loader {

	// ---- Conversion settings ----------------------------------------
	// { kernel, thread, delivery }. The load methods below also read these
	// keys from their options/hooks argument to override them per call.
	// delivery is 'stream' (parts as they finish) or 'end' (open the
	// finished sidecar in one step).

	static usePaths( next ) {

		paths = next ?? null;

	}

	static _dependencyUrls() {

		if ( ! paths ) throw new Error( 'Loader.usePaths() is required before conversion' );
		return dependencyUrls( paths );

	}

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
		for ( const key of [ 'kernel', 'thread', 'delivery' ] ) {

			if ( options?.[ key ] != null ) picked[ key ] = options[ key ];

		}

		return picked;

	}

	static _validateConvertOptions( { thread, delivery } ) {

		if ( ! THREADS.includes( thread ) ) resolveThread( thread );
		if ( ! DELIVERIES.includes( delivery ) ) {

			throw new Error( `unknown geometry delivery "${ delivery }" (expected ${ DELIVERIES.join( ' | ' ) })` );

		}

	}

	// Pre-load the live-file schemas and spawn the convert worker after
	// appReady, so the first model does not pay those cold starts on the
	// interaction path. One plugin at a time: parallel loads contend.
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
			for ( const schema of [ 'ifc4', 'ifc2x3' ] ) {

				if ( ifcRuntime.loadedPlugins().includes( `schema:${ schema }` ) ) continue;
				log.log( `pre-warming main-thread schema:${ schema }` );
				await ifcRuntime.loadPlugin( 'schema', schema );

			}

		} catch ( err ) {

			log.warn( 'main-thread schema warm failed:', err );

		}

	}

	static async _warmConvertWorker() {

		const { kernel } = convertDefaults;
		try {

			const worker = await Loader._getConvertWorker();
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

		Loader._track( sourceId, name );
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

	static canStream() {

		return Loader._canStream();

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
		Loader._track( sourceId, sidecarName );
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

	static _track( sourceId, name ) {

		if ( sourceId == null || Federation.isOpening() ) return;
		Federation.ensureLocal( sourceId, name );

	}

	static clear() {

		viewer?.clearScene();
		Ifc.clear();
		sidecarCache.clear();
		if ( ! Federation.isOpening() ) Federation.reset();

	}

	// The first addFile of an empty scene calls clearScene, which drops a
	// false origin set beforehand. Re-apply after every model is queued.
	static _applyProjectPlacement() {

		const project = Federation.get();
		if ( ! viewer?.setFederationUnit ) return;
		viewer.setFederationUnit( {
			name: project.unit.name,
			prefix: project.unit.prefix,
		} );
		viewer.setFalseOrigin( {
			xyz: project.origin.xyz,
			rzDeg: project.origin.rzDeg,
		} );

	}

	static _applyProjectModel( sourceId ) {

		const model = Federation.modelForSource( sourceId );
		const xf = viewerTransform( model?.transform );
		if ( xf ) viewer.setModelTransform( sourceId, xf );

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

				const zipBytes = new Uint8Array( await file.arrayBuffer() );
				const entries = listZipEntries( zipBytes );
				const named = [];
				for ( const entry of entries ) {

					if ( ! entry.name || entry.name.endsWith( '/' ) ) continue;
					named.push( { path: entry.name, entry } );

				}

				const bag = bagFromEntries( named.map( ( row ) => ( { path: row.path, bytes: null } ) ) );
				if ( bag.projects.length ) {

					const files = [];
					for ( const row of named ) {

						files.push( {
							path: row.path,
							bytes: await readZipEntry( zipBytes, row.entry ),
						} );

					}

					return Loader.openProjectBag( files, hooks, file.name );

				}

				return Loader._openModelZip( zipBytes, hooks, file.name );

			}

			if ( isProjectPath( file.name ) ) {

				const bytes = new Uint8Array( await file.arrayBuffer() );
				return Loader.openProjectBag( [ { path: file.name, bytes } ], hooks, file.name );

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
	// One file stays a model drop. A folder, or several files that include
	// an `.ifcfed`, is a project bag: `{ entries: [{ path, bytes }], label }`.
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
			const payload = await Loader.collectDrop( e.dataTransfer );
			if ( payload ) onFile?.( payload );

		} );

	}

	static async collectDrop( dataTransfer ) {

		if ( ! dataTransfer ) return null;
		const items = [ ...( dataTransfer.items ?? [] ) ];
		const walked = [];
		const canWalk = items.some( ( item ) => typeof item.webkitGetAsEntry === 'function' );
		if ( canWalk ) {

			for ( const item of items ) {

				const entry = item.webkitGetAsEntry?.();
				if ( ! entry ) continue;
				await Loader._walkEntry( entry, '', walked );

			}

		}

		const project = walked.filter( ( row ) => isProjectPath( row.path ) );
		if ( project.length ) {

			return {
				entries: walked.map( ( row ) => ( { path: row.path, bytes: row.bytes } ) ),
				label: basename( project[ 0 ].path ),
			};

		}

		if ( walked.length === 1 ) return { file: walked[ 0 ].file };
		if ( walked.length > 1 ) {

			return {
				files: walked
					.filter( ( row ) => /\.(ifc|ifcview|zip)$/i.test( row.path ) )
					.map( ( row ) => row.file ),
			};

		}

		const file = dataTransfer.files?.[ 0 ];
		return file ? { file } : null;

	}

	static async _walkEntry( entry, prefix, out ) {

		if ( entry.isFile ) {

			const file = await new Promise( ( resolve, reject ) => entry.file( resolve, reject ) );
			out.push( {
				path: `${ prefix }${ entry.name }`,
				bytes: new Uint8Array( await file.arrayBuffer() ),
				file,
			} );
			return;

		}

		if ( ! entry.isDirectory ) return;
		const reader = entry.createReader();
		const children = await Loader._readAllEntries( reader );
		for ( const child of children ) {

			await Loader._walkEntry( child, `${ prefix }${ entry.name }/`, out );

		}

	}

	static _readAllEntries( reader ) {

		return new Promise( ( resolve, reject ) => {

			const all = [];
			const next = () => {

				reader.readEntries( ( batch ) => {

					if ( ! batch.length ) resolve( all );
					else {

						all.push( ...batch );
						next();

					}

				}, reject );

			};

			next();

		} );

	}

	// A project bag is an `.ifcfed` plus the relative files it names. `entries`
	// is `{ path, bytes }`. A zip and a dropped folder both end here.
	static async openProjectBag( entries, hooks, label = 'project.ifcfed' ) {

		const bag = bagFromEntries( entries );
		if ( bag.projects.length === 0 ) {

			throw new Error( `${ label } has no .ifcfed` );

		}

		if ( bag.projects.length > 1 ) {

			throw new Error( `${ label } has more than one .ifcfed: ${ bag.projects.join( ', ' ) }` );

		}

		const fedPath = bag.projects[ 0 ];
		const parsed = parseIfcfed( textOf( bag.files.get( fedPath ) ) );
		if ( ! parsed.doc.name ) parsed.doc.name = basename( fedPath ).replace( /\.ifcfed$/i, '' );
		const manifest = lookupFile( bag.files, `${ fedPath }.manifest` );
		if ( manifest ) {

			try {

				parsed.doc.manifest = JSON.parse( textOf( manifest.bytes ) );

			} catch ( err ) {

				parsed.warnings.push( `Ignoring malformed manifest ${ fedPath }.manifest: ${ err.message }` );

			}

		}

		Federation.beginOpen();
		try {

			Loader.clear();
			Federation.adopt( parsed.doc );
			Loader._applyProjectPlacement();
			const loaded = [];
			for ( const model of parsed.doc.models ) {

				if ( model.connector !== 'local' ) {

					parsed.warnings.push( `${ model.displayName }: connector '${ model.connector }' is not loaded in the browser.` );
					continue;

				}

				Federation.expectModel();
				let sourceId = null;
				try {

					sourceId = await Loader._loadBagModel( bag.files, model, hooks );

				} catch ( err ) {

					Federation.modelArrived( viewer );
					throw err;

				}

				if ( sourceId == null ) {

					Federation.modelArrived( viewer );
					parsed.warnings.push( `${ model.displayName }: missing ${ model.path }.` );
					continue;

				}

				Federation.bind( model.id, sourceId );
				Loader._applyProjectPlacement();
				Loader._applyProjectModel( sourceId );
				loaded.push( sourceId );

			}

			if ( ! loaded.length && parsed.doc.homeView ) viewer?.setCamera?.( parsed.doc.homeView );
			if ( parsed.warnings.length ) log.warn( parsed.warnings.join( '\n' ) );
			return { sourceIds: loaded, warnings: parsed.warnings, name: parsed.doc.name };

		} finally {

			Federation.endOpen();

		}

	}

	static async _loadBagModel( files, model, hooks ) {

		const main = lookupFile( files, model.path );
		if ( ! main ) return null;
		const fileName = basename( model.path );
		const step = isStepBytes( main.bytes );
		if ( /\.ifcview$/i.test( model.path ) && ! step ) {

			return Loader.addFile( new File( [ main.bytes ], fileName ), { replace: false } );

		}

		const ifcName = step && /\.ifcview$/i.test( fileName )
			? fileName.replace( /\.ifcview$/i, '.ifc' )
			: fileName;
		const sideName = sidecarPath( ifcName );
		const side = sideName && sideName.toLowerCase() !== model.path.toLowerCase()
			? lookupFile( files, sideName )
			: null;
		if ( side && ! isStepBytes( side.bytes ) ) {

			return Loader._pairLiveIfc( main.bytes, ifcName, side.bytes, hooks );

		}

		if ( step || /\.ifc$/i.test( model.path ) ) {

			const live = main.bytes.slice();
			return Loader._convertAndPair( main.bytes, live, ifcName, hooks );

		}

		return null;

	}

	// A zip with no `.ifcfed`: one `.ifc` / `.ifcview` pair, as before.
	static async _openModelZip( zipBytes, hooks, zipName ) {

		let found;
		try {

			found = await readZipEntriesByExtension( zipBytes, [ '.ifcview', '.ifc' ] );

		} catch ( err ) {

			log.error( `zip read failed for ${ zipName }:`, err );
			throw err;

		}

		const ifcview = found.find( ( f ) => f.entry.name.toLowerCase().endsWith( '.ifcview' ) );
		const ifcEntry = found.find( ( f ) => f.entry.name.toLowerCase().endsWith( '.ifc' ) );

		if ( ! ifcview && ! ifcEntry ) {

			throw new Error( `zip ${ zipName } contains neither .ifcview nor .ifc` );

		}

		if ( ! ifcview && ifcEntry ) {

			const ifcName = ifcEntry.entry.name.split( '/' ).pop();
			log.log( `zip ${ zipName } has only ${ ifcEntry.entry.name } — converting via worker` );
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

		log.log( `zip ${ zipName } fast path: streaming ${ sidecarName } (${ ifcview.bytes.byteLength } bytes)` );
		const sourceId = await Loader.addFile(
			new File( [ ifcview.bytes ], sidecarName ), { replace: false },
		);

		if ( ifcEntry ) {

			await Loader._openLive( sourceId, ifcEntry.bytes, ifcName, hooks );

		} else {

			log.log( `zip ${ zipName } has no .ifc — properties panel will stay sidecar-only` );

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
		Federation.ensureLocal( sourceId, name );
		return file;

	}

	static async _openLive( sourceId, bytes, name, hooks ) {

		return Loader._attachLive( sourceId, bytes, name, hooks );

	}

	// Convert, optionally stream parts into a federated source, and attach
	// the live IFC. The live parse starts immediately so it overlaps conversion.
	static async _convertAndPair( bytes, liveBytes, ifcName, hooks ) {

		const liveTask = Loader._parseLiveIfc( liveBytes, ifcName );
		const { delivery } = Loader.convertOptions( hooks );
		const streaming = delivery === 'stream' && Loader._canStream();
		if ( delivery === 'stream' && ! streaming ) {

			log.warn( 'streaming requested but the viewer has no stream API; opening geometry when conversion finishes' );

		}

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

		convertWorkerPromise ??= Loader._spawnConvertWorker();
		return convertWorkerPromise;

	}

	static async _spawnConvertWorker() {

		log.log( 'spawning convert worker:', CONVERT_WORKER_URL.href );
		// ifcopenshell imports bare specifiers. The page import map does not
		// apply to a module worker, so conversion boots through a classic
		// worker that installs the same map. The wasm URLs match the page,
		// and the browser reuses the cached modules.
		try {

			const urls = Loader._dependencyUrls();
			const worker = await createIfcOpenShellWorker( CONVERT_WORKER_URL.href, {
				shimUrl: urls.shim,
				assets: { zstdModule: urls.zstdModule, zstdWasm: urls.zstdWasm },
			} );
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

		} catch ( err ) {

			convertWorkerPromise = null;
			throw err;

		}

	}

	// A faulted worker will not answer the next postMessage. Reject what it
	// still owes, terminate it, and let the following load spawn a new one.
	static _dropConvertWorker( worker, reason ) {

		for ( const [ id, pending ] of convertWorkerPending ) {

			if ( pending.worker !== worker ) continue;
			convertWorkerPending.delete( id );
			pending.reject( new Error( reason ) );

		}

		if ( convertWorker === worker ) {

			convertWorker = null;
			convertWorkerPromise = null;

		}

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

			const mainThread = await import( CONVERT_MAIN_URL.href );
			const urls = Loader._dependencyUrls();
			mainThread.configureAssets( { zstdModule: urls.zstdModule, zstdWasm: urls.zstdWasm } );
			const { convertBytes } = mainThread;
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

	static async _convertInWorker( kernel, bytes, filename, numThreads, hooks ) {

		const worker = await Loader._getConvertWorker();
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
