import { refreshAccessToken } from './oauth.js';

const DROPBOX_API_RPC = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2';

function normalizePath( path ) {

	if ( ! path || path === '/' ) return '';
	return path.startsWith( '/' ) ? path : `/${ path }`;

}

function entryPath( entry ) {

	return entry.path_display ?? entry.path_lower ?? entry.name;

}

function mapEntry( entry ) {

	return {
		id: entry.id,
		name: entry.name,
		path: entryPath( entry ),
		isFolder: entry[ '.tag' ] === 'folder',
		size: entry.size,
		modified: entry.client_modified,
	};

}

function summarizeDropboxError( error ) {

	if ( ! error || typeof error !== 'object' ) return null;
	const tag = error[ '.tag' ];
	if ( ! tag ) return null;
	const nested = error[ tag ];
	const nestedSummary = nested && typeof nested === 'object' ? summarizeDropboxError( nested ) : null;
	return nestedSummary ? `${ tag }/${ nestedSummary }` : tag;

}

async function parseDropboxError( response ) {

	const fallback = `HTTP ${ response.status }`;
	try {

		const raw = await response.text();
		if ( ! raw ) return fallback;
		const payload = JSON.parse( raw );
		const errorTag = payload.error?.[ '.tag' ];
		if ( errorTag === 'missing_scope' && payload.error?.required_scope ) {

			return `missing_scope (requires ${ payload.error.required_scope })`;

		}

		if ( payload.error_summary ) return payload.error_summary;
		return summarizeDropboxError( payload.error ) ?? raw.slice( 0, 240 ) ?? fallback;

	} catch {

		return fallback;

	}

}

export function isDropboxMissingScopeError( error ) {

	const message = error instanceof Error ? error.message : String( error );
	return message.includes( 'missing_scope' ) || message.includes( 'insufficient_scope' );

}

export function formatDropboxMissingScopeHelp( error ) {

	const message = error instanceof Error ? error.message : String( error );
	if ( ! isDropboxMissingScopeError( error ) ) return message;
	return (
		`${ message } Disconnect Dropbox, enable file permissions `
		+ '(files.metadata.read, files.content.read, files.content.write) on your app at '
		+ 'dropbox.com/developers, then sign in again.'
	);

}

export function isDropboxNotFoundError( error ) {

	const message = error instanceof Error ? error.message : String( error );
	return message.includes( 'not_found' ) || message.includes( 'path/not_found' );

}

function isDropboxFolderConflict( error ) {

	const message = error instanceof Error ? error.message : String( error );
	return (
		message.includes( 'path/conflict/folder' )
		|| message.includes( 'folder/conflict' )
		|| message.includes( 'path/conflict' )
	);

}

export class DropboxApiClient {

	constructor( clientId, tokenBundle, onTokenRefresh ) {

		this.clientId = clientId;
		this.tokenBundle = tokenBundle;
		this.onTokenRefresh = onTokenRefresh;

	}

	async ensureAccessToken() {

		const expiresAt = this.tokenBundle.expiresAt ?? 0;
		const needsRefresh = expiresAt > 0 && Date.now() >= expiresAt - 60_000;
		if ( ! needsRefresh ) return this.tokenBundle.accessToken;
		if ( ! this.tokenBundle.refreshToken ) throw new Error( 'Dropbox session expired. Connect again.' );

		const refreshed = await refreshAccessToken( this.clientId, this.tokenBundle.refreshToken );
		this.tokenBundle = {
			...this.tokenBundle,
			accessToken: refreshed.access_token,
			refreshToken: refreshed.refresh_token ?? this.tokenBundle.refreshToken,
			expiresAt: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : undefined,
			accountId: refreshed.account_id ?? this.tokenBundle.accountId,
		};
		await this.onTokenRefresh( this.tokenBundle );
		return this.tokenBundle.accessToken;

	}

	async rpc( endpoint, body ) {

		const accessToken = await this.ensureAccessToken();
		const response = await fetch( `${ DROPBOX_API_RPC }/${ endpoint }`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${ accessToken }`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify( body ),
		} );

		if ( ! response.ok ) throw new Error( `Dropbox API error: ${ await parseDropboxError( response ) }` );
		return response.json();

	}

	getCurrentAccount() {

		return this.rpc( 'users/get_current_account', {} );

	}

	async listFolder( path = '' ) {

		const normalized = normalizePath( path );
		const first = await this.rpc( 'files/list_folder', {
			path: normalized,
			recursive: false,
			include_deleted: false,
		} );

		const entries = [ ...first.entries ];
		let cursor = first.cursor;
		let hasMore = Boolean( first.has_more );
		while ( hasMore && cursor ) {

			const next = await this.rpc( 'files/list_folder/continue', { cursor } );
			entries.push( ...next.entries );
			cursor = next.cursor;
			hasMore = Boolean( next.has_more );

		}

		return entries.map( mapEntry ).sort( ( left, right ) => {

			if ( left.isFolder !== right.isFolder ) return left.isFolder ? - 1 : 1;
			return left.name.localeCompare( right.name, undefined, { sensitivity: 'base' } );

		} );

	}

	async downloadFile( path, onProgress ) {

		const accessToken = await this.ensureAccessToken();
		const response = await fetch( `${ DROPBOX_CONTENT }/files/download`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${ accessToken }`,
				'Dropbox-API-Arg': JSON.stringify( { path: normalizePath( path ) } ),
			},
		} );

		if ( ! response.ok ) throw new Error( `Dropbox download failed: ${ await parseDropboxError( response ) }` );

		const apiResult = response.headers.get( 'dropbox-api-result' );
		let rev;
		if ( apiResult ) {

			try {

				rev = JSON.parse( apiResult ).rev;

			} catch {

				rev = undefined;

			}

		}

		const total = Number( response.headers.get( 'content-length' ) ) || 0;
		const report = ( loaded ) => {

			if ( ! onProgress ) return;
			onProgress( {
				loaded,
				total,
				ratio: total > 0 ? Math.min( 1, loaded / total ) : null,
			} );

		};

		report( 0 );
		if ( ! response.body ) {

			const buffer = await response.arrayBuffer();
			report( buffer.byteLength );
			const name = path.split( '/' ).filter( Boolean ).pop() ?? 'download';
			return { bytes: new Uint8Array( buffer ), name, rev };

		}

		const reader = response.body.getReader();
		const chunks = [];
		let loaded = 0;
		for ( ;; ) {

			const step = await reader.read();
			if ( step.done ) break;
			chunks.push( step.value );
			loaded += step.value.byteLength;
			report( loaded );

		}

		const bytes = new Uint8Array( loaded );
		let offset = 0;
		for ( const chunk of chunks ) {

			bytes.set( chunk, offset );
			offset += chunk.byteLength;

		}

		report( loaded );
		const name = path.split( '/' ).filter( Boolean ).pop() ?? 'download';
		return { bytes, name, rev };

	}

	getFileMetadata( path ) {

		return this.rpc( 'files/get_metadata', {
			path: normalizePath( path ),
			include_deleted: false,
		} );

	}

	async ensureFolder( path ) {

		const normalized = normalizePath( path );
		if ( ! normalized || normalized === '/' ) return;

		const parts = normalized.split( '/' ).filter( Boolean );
		let current = '';
		for ( const part of parts ) {

			current += `/${ part }`;
			try {

				await this.getFileMetadata( current );
				continue;

			} catch ( error ) {

				const message = error instanceof Error ? error.message : String( error );
				if ( ! message.includes( 'not_found' ) ) throw error;

			}

			try {

				await this.rpc( 'files/create_folder_v2', { path: current, autorename: false } );

			} catch ( error ) {

				if ( ! isDropboxFolderConflict( error ) ) throw error;

			}

		}

	}

	async uploadFile( path, bytes, options = {} ) {

		const accessToken = await this.ensureAccessToken();
		const normalized = normalizePath( path );
		let mode = { '.tag': 'add' };
		if ( options.forceOverwrite ) mode = { '.tag': 'overwrite' };
		else if ( options.revToMatch ) mode = { '.tag': 'update', update: options.revToMatch };

		const response = await fetch( `${ DROPBOX_CONTENT }/files/upload`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${ accessToken }`,
				'Content-Type': 'application/octet-stream',
				'Dropbox-API-Arg': JSON.stringify( { path: normalized, mode, mute: true } ),
			},
			body: bytes,
		} );

		if ( ! response.ok ) throw new Error( `Dropbox upload failed: ${ await parseDropboxError( response ) }` );

		const meta = await response.json();
		if ( ! meta.rev ) throw new Error( 'Dropbox upload did not return a revision.' );
		return { rev: meta.rev, path: meta.path_display ?? normalized };

	}

}

export function isSupportedConnectorFilename( name ) {

	const lower = name.toLowerCase();
	return (
		lower.endsWith( '.ifc' )
		|| lower.endsWith( '.ifcview' )
		|| lower.endsWith( '.ifcfed' )
		|| lower.endsWith( '.zip' )
		|| lower.endsWith( '.json' )
	);

}
