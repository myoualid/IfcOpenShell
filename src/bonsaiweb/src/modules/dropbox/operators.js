import ops, { Operator } from '../../ops.js';
import { Federation, basename, isProjectPath, parseIfcfed, sidecarPath, textOf } from '../../tool/federation.js';
import { Ifc, Loader } from '../../tool/index.js';
import { store } from '../../context/store.js';
import { Viewer } from '../../tool/Viewer.js';
import { isDropboxNotFoundError } from './api.js';
import { dropboxConnector } from './connector.js';
import { joinSyncPath, readBundledDropboxClientId } from './const.js';
import { listPendingUploads } from './sync-store.js';
import { ensureDropboxState } from './state.js';

function previewClientId( clientId ) {

	const trimmed = clientId?.trim() ?? '';
	if ( ! trimmed ) return '';
	if ( trimmed.length <= 10 ) return trimmed;
	return `${ trimmed.slice( 0, 4 ) }…${ trimmed.slice( - 4 ) }`;

}

async function refreshDropboxSettings( context ) {

	const state = ensureDropboxState( context );
	const settings = await dropboxConnector.getSettings();
	state.syncFolderPath = settings.syncFolderPath;
	state.usesBundledAppKey = dropboxConnector.usesBundledAppKey();
	state.clientId = state.usesBundledAppKey ? '' : ( settings.clientId ?? '' );
	const effectiveClientId = readBundledDropboxClientId() || settings.clientId || '';
	state.clientIdPreview = previewClientId( effectiveClientId );
	return settings;

}

function setBinding( context, binding ) {

	ensureDropboxState( context ).binding = binding;

}

function parentDropboxPath( path ) {

	const parts = String( path || '' ).split( '/' ).filter( Boolean );
	parts.pop();
	return parts.length ? `/${ parts.join( '/' ) }` : '';

}

function joinDropboxPath( folder, relative ) {

	const rel = String( relative || '' ).replace( /^\/+/, '' );
	const base = String( folder || '' ).replace( /\/+$/, '' );
	if ( ! base ) return `/${ rel }`;
	return rel ? `${ base }/${ rel }` : base;

}

async function fetchLocal( context, cloudPath, name ) {

	const state = ensureDropboxState( context );
	const cached = state.localFiles.get( cloudPath );
	if ( cached?.bytes ) {

		state.explorer?.setTransfer( cloudPath, { phase: 'local', name: cached.name || name } );
		return cached;

	}

	const label = name || cloudPath.split( '/' ).filter( Boolean ).pop() || 'file';
	state.explorer?.setTransfer( cloudPath, { phase: 'downloading', progress: null, name: label } );
	try {

		const download = await dropboxConnector.downloadFile( cloudPath, ( progress ) => {

			state.explorer?.setTransfer( cloudPath, {
				phase: 'downloading',
				progress: progress.ratio,
				name: label,
			} );

		} );
		const stored = {
			bytes: download.bytes,
			rev: download.rev ?? null,
			name: download.name || label,
		};
		state.localFiles.set( cloudPath, stored );
		state.explorer?.setTransfer( cloudPath, { phase: 'local', name: stored.name } );
		return stored;

	} catch ( error ) {

		state.explorer?.setTransfer( cloudPath, null );
		throw error;

	}

}

async function downloadRelative( context, cloudPath ) {

	try {

		return await fetchLocal( context, cloudPath );

	} catch ( error ) {

		if ( isDropboxNotFoundError( error ) ) return null;
		throw error;

	}

}

// The `.ifcfed` names files relative to its own folder. A zip snapshot is
// different: the zip already contains those bytes.
async function projectEntriesFromDropbox( context, cloudPath, bytes ) {

	const label = basename( cloudPath );
	const parsed = parseIfcfed( textOf( bytes ) );
	const folder = parentDropboxPath( cloudPath );
	const entries = [ { path: label, bytes } ];
	const wanted = new Set();
	for ( const model of parsed.doc.models ) {

		if ( model.connector !== 'local' || ! model.path ) continue;
		wanted.add( model.path );
		const side = sidecarPath( model.path );
		if ( side ) wanted.add( side );

	}

	for ( const relative of wanted ) {

		const file = await downloadRelative( context, joinDropboxPath( folder, relative ) );
		if ( ! file ) {

			console.warn( `Dropbox project is missing ${ relative }` );
			continue;

		}

		entries.push( { path: relative, bytes: file.bytes } );

	}

	return { entries, label, warnings: parsed.warnings };

}

async function openDropboxBytes( context, cloudPath, bytes, label ) {

	const lower = label.toLowerCase();
	if ( lower.endsWith( '.zip' ) ) {

		await ops.Project.LoadIfc( fileFromBytes( label, bytes ) );
		return;

	}

	if ( isProjectPath( label ) ) {

		const project = await projectEntriesFromDropbox( context, cloudPath, bytes );
		if ( project.warnings.length ) console.warn( project.warnings.join( '\n' ) );
		await ops.Project.OpenBag( project.entries, project.label );
		return;

	}

	await ops.Project.LoadIfc( fileFromBytes( label, bytes ) );

}

function fileFromBytes( name, bytes ) {

	return new File( [ bytes ], name );

}

class DropboxToggle extends Operator {

	static operatorName = 'Dropbox.Toggle';
	static operatorLabel = 'Toggle Dropbox';

	poll() {

		return Boolean( this.context.dropbox?.panel );

	}

	execute() {

		this.context.dropbox.panel.toggle();
		return { status: 'FINISHED' };

	}

}

class DropboxRefreshStatus extends Operator {

	static operatorName = 'Dropbox.RefreshStatus';
	static operatorLabel = 'Refresh Dropbox Status';

	async execute() {

		const state = ensureDropboxState( this.context );
		const status = await dropboxConnector.getConnectionStatus();
		state.connected = status.connected;
		state.accountLabel = status.accountLabel ?? '';
		await refreshDropboxSettings( this.context );
		state.pendingUploadCount = ( await listPendingUploads() ).length;
		return { status: 'FINISHED', result: state };

	}

}

class DropboxSaveSettings extends Operator {

	static operatorName = 'Dropbox.SaveSettings';
	static operatorLabel = 'Save Dropbox Settings';

	constructor( context, clientId ) {

		super( context );
		this.clientId = clientId ?? '';

	}

	async execute() {

		const trimmed = this.clientId.trim();
		if ( trimmed ) await dropboxConnector.saveSettings( { clientId: trimmed } );
		else if ( ! dropboxConnector.usesBundledAppKey() ) {

			throw new Error( 'Paste your Dropbox app key before saving settings.' );

		}

		await refreshDropboxSettings( this.context );
		return { status: 'FINISHED' };

	}

}

class DropboxSaveSyncFolder extends Operator {

	static operatorName = 'Dropbox.SaveSyncFolder';
	static operatorLabel = 'Save Sync Folder';

	constructor( context, syncFolderPath ) {

		super( context );
		this.syncFolderPath = syncFolderPath ?? '';

	}

	poll() {

		return Boolean( this.syncFolderPath.trim() );

	}

	async execute() {

		await dropboxConnector.saveSyncFolderPath( this.syncFolderPath.trim() );
		await refreshDropboxSettings( this.context );
		return { status: 'FINISHED' };

	}

}

class DropboxBeginAuth extends Operator {

	static operatorName = 'Dropbox.BeginAuth';
	static operatorLabel = 'Begin Dropbox Authentication';

	async execute() {

		const state = ensureDropboxState( this.context );
		const { authUrl } = await dropboxConnector.beginAuth();
		state.authUrl = authUrl;
		return { status: 'FINISHED', result: { authUrl } };

	}

}

class DropboxCompleteAuth extends Operator {

	static operatorName = 'Dropbox.CompleteAuth';
	static operatorLabel = 'Complete Dropbox Authentication';

	constructor( context, authCode ) {

		super( context );
		this.authCode = authCode ?? '';

	}

	poll() {

		return Boolean( this.authCode.trim() );

	}

	async execute() {

		await dropboxConnector.completeAuth( this.authCode );
		const state = ensureDropboxState( this.context );
		state.authUrl = '';
		const status = await dropboxConnector.getConnectionStatus();
		state.connected = status.connected;
		state.accountLabel = status.accountLabel ?? '';
		return { status: 'FINISHED', result: status };

	}

}

class DropboxDisconnect extends Operator {

	static operatorName = 'Dropbox.Disconnect';
	static operatorLabel = 'Disconnect Dropbox';

	async execute() {

		await dropboxConnector.disconnect();
		const state = ensureDropboxState( this.context );
		state.connected = false;
		state.accountLabel = '';
		state.entries = [];
		state.browsePath = '';
		state.binding = null;
		state.pendingUploadCount = 0;
		state.localFiles = new Map();
		state.explorer?.clearTransfers();
		return { status: 'FINISHED' };

	}

}

class DropboxExplore extends Operator {

	static operatorName = 'Dropbox.Explore';
	static operatorLabel = 'Explore Dropbox';

	constructor( context, path = '' ) {

		super( context );
		this.path = path ?? '';

	}

	poll() {

		return ensureDropboxState( this.context ).connected;

	}

	async execute() {

		const entries = await dropboxConnector.listFolder( this.path );
		return { status: 'FINISHED', result: { path: this.path, entries } };

	}

}

class DropboxBrowse extends Operator {

	static operatorName = 'Dropbox.Browse';
	static operatorLabel = 'Browse Dropbox';

	constructor( context, path = '' ) {

		super( context );
		this.path = path ?? '';

	}

	poll() {

		return ensureDropboxState( this.context ).connected;

	}

	async execute() {

		const entries = await dropboxConnector.listFiles( this.path );
		const state = ensureDropboxState( this.context );
		state.browsePath = this.path;
		state.entries = entries;
		return { status: 'FINISHED', result: entries };

	}

}

class DropboxOpenFile extends Operator {

	static operatorName = 'Dropbox.OpenFile';
	static operatorLabel = 'Open Dropbox File';

	constructor( context, path, fileName ) {

		super( context );
		this.path = path;
		this.fileName = fileName;

	}

	poll() {

		return Boolean( this.path && Viewer.get() );

	}

	async execute() {

		const stored = await fetchLocal( this.context, this.path, this.fileName );
		const label = this.fileName || stored.name;
		const bytes = stored.bytes;
		await openDropboxBytes( this.context, this.path, bytes, label );
		const contentHash = await dropboxConnector.hashBytes( bytes );

		const binding = {
			connectorId: 'dropbox',
			path: this.path,
			rev: stored.rev ?? null,
			contentHash,
		};
		setBinding( this.context, binding );
		return { status: 'FINISHED', result: { label, ...binding } };

	}

}

class DropboxSyncNow extends Operator {

	static operatorName = 'Dropbox.Sync';
	static operatorLabel = 'Sync With Dropbox';

	poll() {

		return ensureDropboxState( this.context ).connected;

	}

	async execute() {

		const result = await dropboxConnector.syncNow();
		const state = ensureDropboxState( this.context );
		state.lastSyncAt = result.lastSyncAt;
		state.pendingUploadCount = result.pendingCount;
		return { status: 'FINISHED', result };

	}

}

async function projectArchiveBytes() {

	const encoder = new TextEncoder();
	for ( const entry of store.models ) {

		Federation.ensureLocal( entry.id, entry.name || 'model.ifc' );

	}

	const payload = new Map();
	for ( const entry of store.models ) {

		const model = Federation.modelForSource( entry.id );
		if ( ! model ) continue;
		const bundle = Loader.bundle( entry.id );
		let ifc = bundle?.ifc?.data ? { name: bundle.ifc.name, data: bundle.ifc.data } : null;
		if ( ! ifc ) {

			const file = Ifc.get( entry.id );
			if ( file?.toString ) {

				ifc = {
					name: entry.name || 'model.ifc',
					data: encoder.encode( file.toString() ),
				};

			}

		}

		let viewFile = null;
		const cachedView = bundle?.view?.file;
		if ( cachedView ) {

			viewFile = {
				name: bundle.view.name,
				data: new Uint8Array( await cachedView.arrayBuffer() ),
			};

		}

		payload.set( model.id, { ifc, view: viewFile } );

	}

	Federation.captureViewer();
	const archive = Federation.archiveFiles( payload );
	return {
		files: archive.files,
		warnings: archive.warnings,
	};

}

async function saveProjectTree( files, binding, syncFolderPath ) {

	const fed = files.find( ( file ) => isProjectPath( file.name ) );
	if ( ! fed ) throw new Error( 'This session has no project file to save.' );
	const stem = fed.name.replace( /\.ifcfed$/i, '' );
	const ifcfedPath = binding?.path && isProjectPath( binding.path )
		? binding.path
		: joinDropboxPath( joinSyncPath( syncFolderPath, `projects/${ stem }` ), fed.name );
	const folder = parentDropboxPath( ifcfedPath );
	let rev = binding?.rev ?? null;
	for ( const file of files ) {

		const cloudPath = file === fed ? ifcfedPath : joinDropboxPath( folder, file.name );
		const updateFed = cloudPath === ifcfedPath && binding?.rev;
		const result = await dropboxConnector.uploadFile( cloudPath, file.data, updateFed
			? { revToMatch: binding.rev }
			: { forceOverwrite: true } );
		if ( cloudPath === ifcfedPath && result.rev ) rev = result.rev;

	}

	return { path: ifcfedPath, rev };

}

class DropboxSaveProject extends Operator {

	static operatorName = 'Dropbox.SaveProject';
	static operatorLabel = 'Save Project to Dropbox';

	poll() {

		return Boolean( ensureDropboxState( this.context ).connected && this.store.models.length );

	}

	async execute() {

		const packed = await projectArchiveBytes();
		if ( packed.warnings.length ) console.warn( packed.warnings.join( '\n' ) );
		const state = ensureDropboxState( this.context );
		const saved = await saveProjectTree( packed.files, state.binding, state.syncFolderPath );
		const fed = packed.files.find( ( file ) => isProjectPath( file.name ) );
		setBinding( this.context, {
			connectorId: 'dropbox',
			path: saved.path,
			rev: saved.rev,
			contentHash: fed ? await dropboxConnector.hashBytes( fed.data ) : '',
		} );
		return { status: 'FINISHED', result: { ...saved, warnings: packed.warnings } };

	}

}

class DropboxPullProject extends Operator {

	static operatorName = 'Dropbox.PullProject';
	static operatorLabel = 'Reload Project From Dropbox';

	poll() {

		const binding = ensureDropboxState( this.context ).binding;
		return Boolean( binding?.path );

	}

	async execute() {

		const binding = ensureDropboxState( this.context ).binding;
		if ( ! binding?.path ) throw new Error( 'Open project is not linked to Dropbox.' );

		const pull = await dropboxConnector.pullProjectIfChanged( binding );
		if ( ! pull.changed || ! pull.bytes ) return { status: 'FINISHED', result: { changed: false } };

		const label = basename( binding.path );
		if ( isProjectPath( label ) ) {

			await openDropboxBytes( this.context, binding.path, pull.bytes, label );

		} else {

			await ops.Project.LoadIfc( fileFromBytes( label, pull.bytes ) );

		}

		setBinding( this.context, {
			connectorId: 'dropbox',
			path: binding.path,
			rev: pull.rev ?? binding.rev,
			contentHash: pull.contentHash ?? binding.contentHash,
		} );
		return { status: 'FINISHED', result: { changed: true, rev: pull.rev } };

	}

}

export default [
	DropboxToggle,
	DropboxRefreshStatus,
	DropboxSaveSettings,
	DropboxSaveSyncFolder,
	DropboxBeginAuth,
	DropboxCompleteAuth,
	DropboxDisconnect,
	DropboxExplore,
	DropboxBrowse,
	DropboxOpenFile,
	DropboxSyncNow,
	DropboxSaveProject,
	DropboxPullProject,
];
