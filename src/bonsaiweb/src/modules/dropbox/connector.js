import { loadSecureJson, removeSecureJson, saveSecureJson } from './secure-storage.js';
import { DropboxApiClient, isDropboxNotFoundError, isSupportedConnectorFilename } from './api.js';
import {
	DEFAULT_SYNC_FOLDER,
	DROPBOX_CONNECTOR_ID,
	hasBundledDropboxClientId,
	normalizeSyncFolderPath,
	readBundledDropboxClientId,
} from './const.js';
import {
	clearPendingOAuth,
	completeDropboxAuthWithCode,
	createDropboxAuthSession,
	openDropboxAuthorizationPage,
} from './oauth.js';
import { defaultProjectCloudPath, downloadIfChanged, hashBytes, syncDropboxFolder, uploadProjectFile } from './sync.js';
import { clearSyncStore, listPendingUploads } from './sync-store.js';

const SETTINGS_KEY = 'settings';
const TOKENS_KEY = 'tokens';

export const DROPBOX_CONNECTOR_MANIFEST = {
	id: DROPBOX_CONNECTOR_ID,
	name: 'Dropbox',
	version: '0.2.0',
	description: 'Browse, save, and sync IFC projects stored in Dropbox.',
};

function tokenBundleFromResponse( response, previous ) {

	return {
		accessToken: response.access_token,
		refreshToken: response.refresh_token ?? previous?.refreshToken,
		expiresAt: response.expires_in ? Date.now() + response.expires_in * 1000 : undefined,
		accountId: response.account_id ?? previous?.accountId,
		accountLabel: previous?.accountLabel,
	};

}

export class DropboxConnector {

	constructor() {

		this.manifest = DROPBOX_CONNECTOR_MANIFEST;
		this.client = null;

	}

	usesBundledAppKey() {

		return hasBundledDropboxClientId();

	}

	async getSettings() {

		const stored = await loadSecureJson( DROPBOX_CONNECTOR_ID, SETTINGS_KEY );
		const bundledClientId = readBundledDropboxClientId();
		const storedClientId = stored?.clientId?.trim() || undefined;
		return {
			clientId: bundledClientId || storedClientId || undefined,
			syncFolderPath: normalizeSyncFolderPath( stored?.syncFolderPath ?? DEFAULT_SYNC_FOLDER ),
		};

	}

	async saveSettings( settings ) {

		const stored = await loadSecureJson( DROPBOX_CONNECTOR_ID, SETTINGS_KEY );
		const bundledClientId = readBundledDropboxClientId();
		const syncFolderPath = normalizeSyncFolderPath(
			settings.syncFolderPath ?? stored?.syncFolderPath ?? DEFAULT_SYNC_FOLDER,
		);
		const overrideClientId = settings.clientId?.trim() || undefined;
		const effectiveClientId = bundledClientId || overrideClientId || stored?.clientId?.trim();
		if ( ! effectiveClientId ) throw new Error( 'Dropbox app key is required.' );

		const payload = { syncFolderPath };
		if ( ! bundledClientId ) {

			payload.clientId = overrideClientId || stored?.clientId?.trim() || effectiveClientId;

		} else if ( overrideClientId && overrideClientId !== bundledClientId ) {

			payload.clientId = overrideClientId;

		}

		await saveSecureJson( DROPBOX_CONNECTOR_ID, SETTINGS_KEY, payload );

	}

	async saveSyncFolderPath( syncFolderPath ) {

		await this.saveSettings( { syncFolderPath } );

	}

	async loadTokens() {

		return loadSecureJson( DROPBOX_CONNECTOR_ID, TOKENS_KEY );

	}

	async saveTokens( tokens ) {

		await saveSecureJson( DROPBOX_CONNECTOR_ID, TOKENS_KEY, { ...tokens } );

	}

	async clearTokens() {

		await removeSecureJson( DROPBOX_CONNECTOR_ID, TOKENS_KEY );
		this.client = null;

	}

	async resolveClientId() {

		const settings = await this.getSettings();
		const clientId = settings.clientId ?? readBundledDropboxClientId();
		if ( ! clientId ) throw new Error( 'Configure a Dropbox app key before connecting.' );
		return clientId;

	}

	async isReady() {

		const tokens = await this.loadTokens();
		return Boolean( tokens?.accessToken && tokens?.refreshToken );

	}

	async beginAuth() {

		const clientId = await this.resolveClientId();
		const session = await createDropboxAuthSession( clientId );
		return { authUrl: session.authUrl };

	}

	async completeAuth( authCodeInput ) {

		const clientId = await this.resolveClientId();
		const tokens = await completeDropboxAuthWithCode( clientId, authCodeInput );
		await this.saveTokens( tokenBundleFromResponse( tokens ) );
		this.client = null;

		const settings = await this.getSettings();
		const client = await this.ensureClient();
		await client.ensureFolder( settings.syncFolderPath );

		const status = await this.getConnectionStatus();
		if ( ! status.connected ) throw new Error( 'Dropbox authentication did not complete.' );

	}

	openAuthorizationPage( authUrl ) {

		openDropboxAuthorizationPage( authUrl );

	}

	async ensureClient() {

		if ( this.client ) return this.client;

		const clientId = await this.resolveClientId();
		const tokens = await this.loadTokens();
		if ( ! tokens?.accessToken ) throw new Error( 'Dropbox is not connected.' );

		this.client = new DropboxApiClient( clientId, tokens, async ( bundle ) => {

			await this.saveTokens( bundle );

		} );
		return this.client;

	}

	async getConnectionStatus() {

		const ready = await this.isReady();
		if ( ! ready ) return { connected: false };

		const tokens = await this.loadTokens();
		try {

			const client = await this.ensureClient();
			const account = await client.getCurrentAccount();
			const accountLabel = account.name?.display_name ?? account.email ?? account.account_id;
			if ( accountLabel && tokens?.accountLabel !== accountLabel ) {

				await this.saveTokens( { ...tokens, accountLabel, accountId: account.account_id } );

			}

			return { connected: true, accountLabel };

		} catch {

			return { connected: true, accountLabel: tokens?.accountLabel };

		}

	}

	cancelAuth() {

		clearPendingOAuth();

	}

	async disconnect() {

		clearPendingOAuth();
		await this.clearTokens();
		await clearSyncStore();

	}

	async listFolder( path = '' ) {

		const client = await this.ensureClient();
		try {

			return await client.listFolder( path );

		} catch ( error ) {

			if ( isDropboxNotFoundError( error ) ) return [];
			throw error;

		}

	}

	async listFiles( path = '' ) {

		const entries = await this.listFolder( path );
		return entries.filter( ( entry ) => entry.isFolder || isSupportedConnectorFilename( entry.name ) );

	}

	async downloadFile( path, onProgress ) {

		const client = await this.ensureClient();
		const result = await client.downloadFile( path, onProgress );
		return { bytes: result.bytes, name: result.name, path, rev: result.rev };

	}

	async uploadFile( path, bytes, options = {} ) {

		const client = await this.ensureClient();
		return uploadProjectFile( client, DROPBOX_CONNECTOR_ID, path, bytes, {
			revToMatch: options.revToMatch ?? null,
			forceOverwrite: Boolean( options.forceOverwrite ),
			offlineQueue: options.offlineQueue ?? true,
			contentType: options.contentType,
		} );

	}

	async saveProjectBytes( filename, bytes, binding ) {

		const settings = await this.getSettings();
		const path = binding?.path ?? defaultProjectCloudPath( settings.syncFolderPath, filename.replace( /^\/+/, '' ) );
		const result = await this.uploadFile( path, bytes, {
			revToMatch: binding?.rev ?? null,
			offlineQueue: true,
		} );
		return { path, rev: result.rev, queued: result.queued };

	}

	async syncNow() {

		const settings = await this.getSettings();
		const client = await this.ensureClient();
		const result = await syncDropboxFolder( client, DROPBOX_CONNECTOR_ID, settings.syncFolderPath );
		const pending = await listPendingUploads();
		return { ...result, pendingCount: pending.length };

	}

	async pullProjectIfChanged( binding ) {

		const client = await this.ensureClient();
		return downloadIfChanged( client, binding );

	}

	hashBytes( bytes ) {

		return hashBytes( bytes );

	}

}

export const dropboxConnector = new DropboxConnector();
