// In-memory `.ifcfed` (schema ifcfed/1) and the relative-path bag around it.
// The viewer places models. This module only stores the project and turns a
// zip or a dropped folder into the names the file already uses.
//
// A connector later fills the same bag (`{ path, bytes }`) and calls the same
// opener. It does not get its own loader.

const SCHEMA = 'ifcfed/1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let doc = blank();
const modelBySource = new Map();
let opening = false;
let homePending = 0;

function blank() {

	const now = new Date().toISOString();
	return {
		schema: SCHEMA,
		name: 'project',
		created: now,
		modified: now,
		unit: { name: 'METRE', prefix: '' },
		origin: { xyz: [ 0, 0, 0 ], rzDeg: 0 },
		groups: [],
		models: [],
		homeView: null,
		manifest: null,
	};

}

function vec3( value ) {

	if ( ! Array.isArray( value ) || value.length !== 3 ) return [ 0, 0, 0 ];
	return value.map( ( n ) => Number( n ) || 0 );

}

function sameVec( a, b ) {

	return a.length === b.length && a.every( ( n, i ) => n === b[ i ] );

}

function defaultTransform() {

	return {
		aFrame: 'ModelGlobal',
		a: [ 0, 0, 0 ],
		b: [ 0, 0, 0 ],
		rxyzDeg: [ 0, 0, 0 ],
		pivot: [ 0, 0, 0 ],
	};

}

function isDefaultTransform( xf ) {

	if ( ! xf ) return true;
	const d = defaultTransform();
	return xf.aFrame === d.aFrame
		&& sameVec( xf.a, d.a )
		&& sameVec( xf.b, d.b )
		&& sameVec( xf.rxyzDeg, d.rxyzDeg )
		&& sameVec( xf.pivot, d.pivot );

}

export function newId() {

	if ( globalThis.crypto?.randomUUID ) return globalThis.crypto.randomUUID();
	return `m-${ Date.now().toString( 36 ) }-${ Math.random().toString( 36 ).slice( 2, 10 ) }`;

}

export function normalizeRelativePath( path ) {

	if ( typeof path !== 'string' ) return '';
	let name = path.replace( /\\/g, '/' ).replace( /^\.\//, '' );
	while ( name.startsWith( '/' ) ) name = name.slice( 1 );
	if ( ! name || name.endsWith( '/' ) ) return '';
	if ( name.split( '/' ).some( ( part ) => part === '..' ) ) return '';
	return name;

}

export function basename( path ) {

	const name = normalizeRelativePath( path );
	const cut = name.lastIndexOf( '/' );
	return cut === - 1 ? name : name.slice( cut + 1 );

}

// `.ifc` → `.ifcview` with the same directory. Anything else returns ''.
export function sidecarPath( path ) {

	const name = normalizeRelativePath( path );
	if ( ! /\.ifc$/i.test( name ) ) return '';
	return name.replace( /\.ifc$/i, '.ifcview' );

}

// The live file is the model path. A sidecar name is only the path when
// there is no `.ifc`.
export function ifcPathFor( path ) {

	const name = normalizeRelativePath( path );
	if ( /\.ifcview$/i.test( name ) ) return name.replace( /\.ifcview$/i, '.ifc' );
	return name;

}

const STEP_MAGIC = 'ISO-10303-21';

export function isStepBytes( bytes ) {

	if ( ! bytes || bytes.byteLength < STEP_MAGIC.length ) return false;
	let head = '';
	for ( let i = 0; i < STEP_MAGIC.length; i ++ ) head += String.fromCharCode( bytes[ i ] );
	return head === STEP_MAGIC;

}

// One shared first folder (`Site/Site.ifcfed`) is the folder someone zipped.
// Paths inside the `.ifcfed` do not include it.
export function stripSharedRoot( paths ) {

	const files = paths.filter( ( name ) => name && ! name.endsWith( '/' ) );
	if ( ! files.length || files.some( ( name ) => ! name.includes( '/' ) ) ) {

		return { root: '', paths };

	}

	const root = files[ 0 ].split( '/' )[ 0 ];
	if ( ! root || files.some( ( name ) => ! name.startsWith( `${ root }/` ) ) ) {

		return { root: '', paths };

	}

	return {
		root,
		paths: paths.map( ( name ) => ( name.startsWith( `${ root }/` ) ? name.slice( root.length + 1 ) : name ) ),
	};

}

export function isProjectPath( path ) {

	const name = String( path ).toLowerCase();
	return name.endsWith( '.ifcfed' ) && ! name.endsWith( '.ifcfed.manifest' );

}

function ignoredZipPath( path ) {

	const name = String( path ).replace( /\\/g, '/' );
	return name.includes( '__MACOSX/' ) || name.endsWith( '.DS_Store' );

}

// Case-sensitive, then one case-insensitive match.
export function lookupFile( files, path ) {

	const name = normalizeRelativePath( path );
	if ( ! name ) return null;
	if ( files.has( name ) ) return { path: name, bytes: files.get( name ) };
	const lower = name.toLowerCase();
	for ( const [ key, bytes ] of files ) {

		if ( key.toLowerCase() === lower ) return { path: key, bytes };

	}

	return null;

}

function readGroups( value, warnings, label ) {

	if ( ! Array.isArray( value ) ) return [];
	const groups = [];
	for ( let i = 0; i < value.length; i ++ ) {

		const entry = value[ i ];
		if ( ! entry || typeof entry !== 'object' ) {

			warnings.push( `${ label }[${ i }] is not an object; skipping.` );
			continue;

		}

		const group = {
			id: typeof entry.id === 'string' && entry.id ? entry.id : newId(),
			displayName: typeof entry.display_name === 'string' ? entry.display_name : '',
			visible: entry.visible !== false,
			children: readGroups( entry.groups, warnings, `${ label }[${ i }].groups` ),
		};
		groups.push( group );

	}

	return groups;

}

function indexGroups( groups, into = new Map() ) {

	for ( const group of groups ) {

		into.set( group.id, group );
		indexGroups( group.children, into );

	}

	return into;

}

function readTransform( value ) {

	if ( ! value || typeof value !== 'object' ) return null;
	return {
		aFrame: value.a_frame === 'ModelLocal' ? 'ModelLocal' : 'ModelGlobal',
		a: vec3( value.a ),
		b: vec3( value.b ),
		rxyzDeg: vec3( value.rxyz_deg ),
		pivot: vec3( value.pivot ),
	};

}

export function parseIfcfed( text ) {

	const warnings = [];
	let root;
	try {

		root = JSON.parse( text );

	} catch ( err ) {

		throw new Error( `Parse error in .ifcfed: ${ err.message }`, { cause: err } );

	}

	if ( ! root || typeof root !== 'object' || Array.isArray( root ) ) {

		throw new Error( 'Parse error in .ifcfed: root is not an object' );

	}

	if ( root.schema !== SCHEMA ) {

		warnings.push( `Unknown schema '${ root.schema ?? '' }' (expected '${ SCHEMA }'); attempting to load anyway.` );

	}

	const unit = root.config?.unit ?? {};
	const origin = root.federated_false_origin ?? {};
	const groups = readGroups( root.groups, warnings, 'groups' );
	const knownGroups = indexGroups( groups );
	const models = [];
	const listed = Array.isArray( root.models ) ? root.models : [];
	for ( let i = 0; i < listed.length; i ++ ) {

		const entry = listed[ i ];
		if ( ! entry || typeof entry !== 'object' ) {

			warnings.push( `models[${ i }] is not an object; skipping.` );
			continue;

		}

		const source = entry.source ?? {};
		const connector = typeof source.connector === 'string' && source.connector
			? source.connector
			: 'local';
		const model = {
			id: typeof entry.id === 'string' && entry.id ? entry.id : newId(),
			displayName: typeof entry.display_name === 'string' ? entry.display_name : '',
			connector,
			path: '',
			sourceData: {},
			transform: readTransform( entry.model_transformation ),
			visible: entry.visible !== false,
			groupId: typeof entry.group_id === 'string' ? entry.group_id : '',
		};
		if ( connector === 'local' ) {

			model.path = normalizeRelativePath( source.path );
			if ( ! model.path ) {

				warnings.push( `models[${ i }]: missing source.path; skipping.` );
				continue;

			}

			if ( isProjectPath( model.path ) ) {

				warnings.push( `models[${ i }]: nested .ifcfed is not a model; skipping.` );
				continue;

			}

			if ( ! model.displayName ) model.displayName = basename( model.path );

		} else {

			const data = { ...source };
			delete data.connector;
			model.sourceData = data;
			if ( ! model.displayName ) model.displayName = model.id;

		}

		if ( model.groupId && ! knownGroups.has( model.groupId ) ) {

			warnings.push( `models[${ i }]: unknown group_id '${ model.groupId }'; moved to root.` );
			model.groupId = '';

		}

		models.push( model );

	}

	let homeView = null;
	if ( root.home_view && typeof root.home_view === 'object' ) {

		const target = vec3( root.home_view.target );
		homeView = {
			target,
			distance: Number( root.home_view.distance ?? 50 ) || 50,
			yaw: Number( root.home_view.yaw ?? 45 ) || 0,
			pitch: Number( root.home_view.pitch ?? 30 ) || 0,
		};

	}

	return {
		warnings,
		doc: {
			schema: SCHEMA,
			name: typeof root.name === 'string' ? root.name : '',
			created: typeof root.created === 'string' ? root.created : '',
			modified: typeof root.modified === 'string' ? root.modified : '',
			unit: {
				name: typeof unit.name === 'string' && unit.name ? unit.name : 'METRE',
				prefix: typeof unit.prefix === 'string' ? unit.prefix : '',
			},
			origin: {
				xyz: vec3( origin.xyz ),
				rzDeg: Number( origin.rz_deg ) || 0,
			},
			groups,
			models,
			homeView,
			manifest: null,
		},
	};

}

function writeGroups( groups ) {

	return groups.map( ( group ) => {

		const entry = {
			id: group.id,
			display_name: group.displayName,
		};
		if ( ! group.visible ) entry.visible = false;
		if ( group.children?.length ) entry.groups = writeGroups( group.children );
		return entry;

	} );

}

function writeVec( value ) {

	return [ value[ 0 ], value[ 1 ], value[ 2 ] ];

}

export function serializeIfcfed( project, now = new Date().toISOString() ) {

	const created = project.created || now;
	const root = {
		schema: SCHEMA,
		created,
		modified: now,
		config: {
			unit: {
				name: project.unit?.name || 'METRE',
				prefix: project.unit?.prefix || '',
			},
		},
		federated_false_origin: {
			xyz: writeVec( project.origin?.xyz ?? [ 0, 0, 0 ] ),
			rz_deg: project.origin?.rzDeg ?? 0,
		},
	};
	if ( project.name ) root.name = project.name;
	if ( project.groups?.length ) root.groups = writeGroups( project.groups );

	root.models = ( project.models ?? [] ).map( ( model ) => {

		const entry = {
			id: model.id,
			display_name: model.displayName,
			source: { connector: model.connector || 'local' },
		};
		if ( ( model.connector || 'local' ) === 'local' ) {

			entry.source.path = model.path;

		} else {

			Object.assign( entry.source, model.sourceData ?? {} );

		}

		if ( ! isDefaultTransform( model.transform ) ) {

			const xf = model.transform;
			entry.model_transformation = {
				a_frame: xf.aFrame === 'ModelLocal' ? 'ModelLocal' : 'ModelGlobal',
				a: writeVec( xf.a ),
				b: writeVec( xf.b ),
				rxyz_deg: writeVec( xf.rxyzDeg ),
				pivot: writeVec( xf.pivot ),
			};

		}

		if ( ! model.visible ) entry.visible = false;
		if ( model.groupId ) entry.group_id = model.groupId;
		return entry;

	} );

	if ( project.homeView ) {

		const home = project.homeView;
		root.home_view = {
			target: writeVec( home.target ),
			distance: home.distance,
			yaw: home.yaw,
			pitch: home.pitch,
		};

	} else {

		root.home_view = null;

	}

	return JSON.stringify( root, null, 2 );

}

function chainVisible( groups, groupId ) {

	if ( ! groupId ) return true;

	function walk( list, ancestorsOpen ) {

		for ( const group of list ) {

			const open = ancestorsOpen && group.visible !== false;
			if ( group.id === groupId ) return open;
			const nested = walk( group.children ?? [], open );
			if ( nested != null ) return nested;

		}

		return null;

	}

	const found = walk( groups, true );
	return found !== false;

}

export function viewerTransform( xf ) {

	if ( ! xf || isDefaultTransform( xf ) ) return null;
	return {
		aFrame: xf.aFrame === 'ModelLocal' ? 'local' : 'global',
		a: xf.a,
		b: xf.b,
		rotationDeg: xf.rxyzDeg,
		pivot: xf.pivot,
	};

}

export function fromViewerTransform( xf ) {

	if ( ! xf ) return null;
	const stored = {
		aFrame: xf.aFrame === 'local' ? 'ModelLocal' : 'ModelGlobal',
		a: vec3( xf.a ),
		b: vec3( xf.b ),
		rxyzDeg: vec3( xf.rotationDeg ),
		pivot: vec3( xf.pivot ),
	};
	return isDefaultTransform( stored ) ? null : stored;

}

function uniquePath( path, id, used ) {

	const name = normalizeRelativePath( path ) || 'model.ifc';
	if ( ! used.has( name.toLowerCase() ) ) {

		used.add( name.toLowerCase() );
		return name;

	}

	const cut = name.lastIndexOf( '/' );
	const file = cut === - 1 ? name : name.slice( cut + 1 );
	const dir = cut === - 1 ? '' : name.slice( 0, cut + 1 );
	const next = `${ dir }${ id }/${ file }`;
	used.add( next.toLowerCase() );
	return next;

}

function projectStem( project ) {

	const name = ( project.name || 'project' ).trim() || 'project';
	return basename( name ).replace( /\.(ifcfed|zip)$/i, '' ) || 'project';

}

export class Federation {

	static get() {

		return doc;

	}

	static isOpening() {

		return opening;

	}

	static beginOpen() {

		opening = true;

	}

	static endOpen() {

		opening = false;

	}

	static reset() {

		doc = blank();
		modelBySource.clear();
		homePending = 0;

	}

	// Count models that will finish loading. The camera is restored when the
	// last of them arrives, after the viewer's own frame.
	static expectModel() {

		if ( doc.homeView ) homePending += 1;

	}

	static modelArrived( viewer ) {

		if ( homePending <= 0 ) return;
		homePending -= 1;
		if ( homePending === 0 && doc.homeView && viewer?.setCamera ) {

			viewer.setCamera( doc.homeView );

		}

	}

	static adopt( project ) {

		doc = project;
		modelBySource.clear();
		homePending = 0;

	}

	static bind( modelId, sourceId ) {

		if ( sourceId == null ) return;
		modelBySource.set( sourceId, modelId );

	}

	static modelForSource( sourceId ) {

		const id = modelBySource.get( sourceId );
		return doc.models.find( ( model ) => model.id === id ) ?? null;

	}

	static ensureLocal( sourceId, filename ) {

		if ( opening || sourceId == null ) return null;
		const path = normalizeRelativePath( filename ) || `model-${ sourceId }.ifc`;
		const existing = Federation.modelForSource( sourceId );
		if ( existing ) {

			// addFile tracks the sidecar name first. The live `.ifc` is the
			// path the project file should keep.
			if ( /\.ifc$/i.test( path ) && /\.ifcview$/i.test( existing.path ) ) {

				if ( existing.displayName === basename( existing.path ) ) {

					existing.displayName = basename( path );

				}

				existing.path = path;

			}

			return existing;

		}

		const model = {
			id: newId(),
			displayName: basename( path ) || path,
			connector: 'local',
			path,
			sourceData: {},
			transform: null,
			visible: true,
			groupId: '',
		};
		doc.models.push( model );
		Federation.bind( model.id, sourceId );
		return model;

	}

	static setUnit( unit ) {

		doc.unit = {
			name: unit?.name || 'METRE',
			prefix: unit?.prefix || '',
		};

	}

	static setOrigin( origin ) {

		doc.origin = {
			xyz: vec3( origin?.xyz ),
			rzDeg: Number( origin?.rzDeg ?? origin?.rz_deg ) || 0,
		};

	}

	static setTransform( sourceId, xf ) {

		const model = Federation.modelForSource( sourceId );
		if ( ! model ) return;
		model.transform = fromViewerTransform( xf );

	}

	static clearTransform( sourceId ) {

		const model = Federation.modelForSource( sourceId );
		if ( model ) model.transform = null;

	}

	static setVisible( sourceId, visible ) {

		const model = Federation.modelForSource( sourceId );
		if ( model ) model.visible = Boolean( visible );

	}

	static isEffectivelyVisible( model ) {

		if ( ! model || model.visible === false ) return false;
		return chainVisible( doc.groups, model.groupId );

	}

	static captureViewer( viewer ) {

		try {

			const origin = viewer?.getFalseOrigin?.();
			if ( origin?.xyz ) Federation.setOrigin( origin );

		} catch { /* viewer has no origin yet */ }

		try {

			const camera = viewer?.getCamera?.();
			if ( camera?.target ) {

				doc.homeView = {
					target: vec3( camera.target ),
					distance: Number( camera.distance ) || 50,
					yaw: Number( camera.yaw ) || 0,
					pitch: Number( camera.pitch ) || 0,
				};

			}

		} catch { /* camera is not ready */ }

	}

	// `payload` is a Map of federation model id → { ifc, view }, each
	// `{ name, data: Uint8Array } | null`. Models with no bytes stay in the
	// JSON and are omitted from the archive.
	static archiveFiles( payload ) {

		const warnings = [];
		const used = new Set();
		const files = [];
		for ( const model of doc.models ) {

			if ( model.connector !== 'local' ) continue;
			const row = payload.get( model.id );
			const ifc = row?.ifc?.data ? row.ifc : null;
			const view = row?.view?.data ? row.view : null;
			if ( ! ifc && ! view ) {

				warnings.push( `${ model.displayName || model.path }: no bytes; kept in the project only.` );
				continue;

			}

			let path = model.path;
			if ( ifc && ( /\.ifcview$/i.test( path ) || ! /\.ifc$/i.test( path ) ) ) {

				path = ifcPathFor( ifc.name || path );

			} else if ( ! ifc && view ) {

				path = sidecarPath( path ) || view.name || path;

			}

			path = uniquePath( path, model.id, used );
			if ( model.displayName === basename( model.path ) && path !== model.path ) {

				model.displayName = basename( path );

			}

			model.path = path;
			if ( ifc ) files.push( { name: path, data: ifc.data } );
			if ( view ) {

				let viewName = ifc ? ( sidecarPath( path ) || view.name ) : path;
				if ( viewName !== path ) {

					if ( used.has( viewName.toLowerCase() ) ) viewName = uniquePath( viewName, model.id, used );
					else used.add( viewName.toLowerCase() );
					files.push( { name: viewName, data: view.data } );

				} else if ( ! ifc ) {

					files.push( { name: path, data: view.data } );

				}

			}

		}

		const stem = projectStem( doc );
		if ( ! doc.name ) doc.name = stem;
		const jsonName = `${ stem }.ifcfed`;
		const json = encoder.encode( serializeIfcfed( doc ) );
		return {
			filename: `${ stem }.zip`,
			warnings,
			files: [ { name: jsonName, data: json }, ...files ],
		};

	}

}

export function textOf( bytes ) {

	return decoder.decode( bytes );

}

export function bytesOf( text ) {

	return encoder.encode( text );

}

export function bagFromEntries( entries ) {

	const warnings = [];
	const raw = [];
	for ( const entry of entries ) {

		const name = normalizeRelativePath( entry.path );
		if ( ! name || ignoredZipPath( entry.path ) ) continue;
		raw.push( { path: name, bytes: entry.bytes } );

	}

	const stripped = stripSharedRoot( raw.map( ( entry ) => entry.path ) );
	const files = new Map();
	raw.forEach( ( entry, index ) => {

		const path = stripped.paths[ index ];
		if ( path ) files.set( path, entry.bytes );

	} );

	const projects = [ ...files.keys() ].filter( ( path ) => isProjectPath( path ) );
	return { files, projects, root: stripped.root, warnings };

}

export { SCHEMA };
