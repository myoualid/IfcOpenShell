import { SYNC_INDEX_FILENAME, joinSyncPath, normalizeSyncFolderPath } from './const.js';
import {
	getCachedRevision,
	listPendingUploads,
	queuePendingUpload,
	removePendingUpload,
	setCachedRevision,
} from './sync-store.js';

function createClientId() {

	if ( typeof crypto !== 'undefined' && crypto.randomUUID ) return crypto.randomUUID();
	return `bonsai-${ Date.now() }`;

}

let cachedClientId = null;

export function getSyncClientId() {

	if ( ! cachedClientId ) cachedClientId = createClientId();
	return cachedClientId;

}

export async function hashBytes( bytes ) {

	const digest = await crypto.subtle.digest( 'SHA-256', bytes.slice() );
	return Array.from( new Uint8Array( digest ) )
		.map( ( byte ) => byte.toString( 16 ).padStart( 2, '0' ) )
		.join( '' );

}

function isOfflineError( error ) {

	if ( typeof navigator !== 'undefined' && navigator.onLine === false ) return true;
	return error instanceof TypeError;

}

export async function flushPendingUploads( client, connectorId ) {

	const pending = await listPendingUploads();
	let flushed = 0;

	for ( const entry of pending ) {

		if ( entry.connectorId !== connectorId ) continue;
		try {

			const result = await client.uploadFile( entry.path, entry.bytes, {
				revToMatch: entry.revToMatch,
				contentType: entry.contentType,
			} );
			const contentHash = await hashBytes( entry.bytes );
			await setCachedRevision( {
				path: entry.path,
				rev: result.rev,
				contentHash,
				updatedAt: Date.now(),
			} );
			await removePendingUpload( entry.id );
			flushed += 1;

		} catch ( error ) {

			if ( isOfflineError( error ) ) break;
			throw error;

		}

	}

	return flushed;

}

export async function uploadProjectFile( client, connectorId, path, bytes, options = {} ) {

	const revToMatch = options.revToMatch ?? null;
	const contentType = options.contentType ?? 'application/octet-stream';

	try {

		await client.ensureFolder( path.split( '/' ).slice( 0, - 1 ).join( '/' ) || '/' );
		const result = await client.uploadFile( path, bytes, {
			revToMatch: options.forceOverwrite ? null : revToMatch,
			forceOverwrite: Boolean( options.forceOverwrite ),
			contentType,
		} );
		const contentHash = await hashBytes( bytes );
		await setCachedRevision( {
			path,
			rev: result.rev,
			contentHash,
			updatedAt: Date.now(),
		} );
		return { rev: result.rev, queued: false };

	} catch ( error ) {

		if ( ! options.offlineQueue || ! isOfflineError( error ) ) throw error;
		await queuePendingUpload( {
			id: `${ connectorId }:${ path }:${ Date.now() }`,
			connectorId,
			path,
			bytes,
			revToMatch,
			contentType,
			createdAt: Date.now(),
		} );
		return { rev: revToMatch ?? '', queued: true };

	}

}

export async function downloadIfChanged( client, binding ) {

	const remote = await client.getFileMetadata( binding.path );
	const cached = await getCachedRevision( binding.path );
	const remoteRev = remote.rev;
	const sameRev = binding.rev && binding.rev === remoteRev;
	const sameHash = cached?.contentHash && binding.contentHash && cached.contentHash === binding.contentHash;

	if ( sameRev || ( remoteRev && cached?.rev === remoteRev && sameHash ) ) {

		return { changed: false, rev: remoteRev };

	}

	const download = await client.downloadFile( binding.path );
	const contentHash = await hashBytes( download.bytes );
	await setCachedRevision( {
		path: binding.path,
		rev: download.rev ?? remoteRev,
		contentHash,
		updatedAt: Date.now(),
	} );

	return {
		changed: true,
		bytes: download.bytes,
		rev: download.rev ?? remoteRev,
		contentHash,
	};

}

export async function syncDropboxFolder( client, connectorId, syncFolderPath ) {

	const folder = normalizeSyncFolderPath( syncFolderPath );
	await client.ensureFolder( folder );

	const pendingFlushed = await flushPendingUploads( client, connectorId );
	const entries = await client.listFolder( folder );
	const indexPath = joinSyncPath( folder, SYNC_INDEX_FILENAME );
	const indexEntries = [];

	for ( const entry of entries ) {

		if ( entry.isFolder || entry.name === SYNC_INDEX_FILENAME ) continue;
		try {

			const meta = await client.getFileMetadata( entry.path );
			const cached = await getCachedRevision( entry.path );
			indexEntries.push( {
				path: entry.path,
				rev: meta.rev,
				contentHash: cached?.contentHash ?? '',
				updatedAt: Date.now(),
			} );

		} catch {

			// Skip unreadable entries while rebuilding the index.

		}

	}

	const index = {
		version: 1,
		lastSyncAt: Date.now(),
		clientId: getSyncClientId(),
		entries: indexEntries,
	};
	const indexBytes = new TextEncoder().encode( JSON.stringify( index, null, 2 ) );
	const cachedIndex = await getCachedRevision( indexPath );
	await uploadProjectFile( client, connectorId, indexPath, indexBytes, {
		revToMatch: cachedIndex?.rev ?? null,
		contentType: 'application/json',
		offlineQueue: true,
	} );

	return {
		uploaded: 1,
		downloaded: 0,
		pendingFlushed,
		conflicts: [],
		lastSyncAt: index.lastSyncAt,
	};

}

export function defaultProjectCloudPath( syncFolderPath, filename ) {

	return joinSyncPath( normalizeSyncFolderPath( syncFolderPath ), `projects/${ filename }` );

}
