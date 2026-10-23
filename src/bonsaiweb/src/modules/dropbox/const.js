/** Default Dropbox folder for project sync. */
export const DEFAULT_SYNC_FOLDER = '/bonsai-web';

/** Sync index file stored inside the sync folder. */
export const SYNC_INDEX_FILENAME = 'bonsai-sync-index.json';

export const DROPBOX_CONNECTOR_ID = 'dropbox';

/** Payload a File Manager row puts on a drag into the viewport. */
export const DROPBOX_DRAG_TYPE = 'application/x-bonsai-dropbox';

/** File scopes the app needs (Permissions tab on the Dropbox app). */
export const DROPBOX_REQUIRED_SCOPES = [
	'files.metadata.read',
	'files.content.read',
	'files.content.write',
];

/**
 * Scopes requested on token refresh. Authorization omits an explicit scope
 * list so Dropbox grants every scope enabled on the app.
 */
export const DROPBOX_OAUTH_SCOPES = [
	'account_info.read',
	...DROPBOX_REQUIRED_SCOPES,
].join( ' ' );

let configuredClientId = '';

/** Host override, for example `configuration.dropbox.clientId`. */
export function setBundledDropboxClientId( clientId ) {

	configuredClientId = typeof clientId === 'string' ? clientId.trim() : '';

}

export function parseDropboxGrantedScopes( scopeField ) {

	if ( ! scopeField?.trim() ) return new Set();
	return new Set( scopeField.trim().split( /\s+/ ).filter( Boolean ) );

}

export function missingDropboxRequiredScopes( scopeField ) {

	const granted = parseDropboxGrantedScopes( scopeField );
	return DROPBOX_REQUIRED_SCOPES.filter( ( scope ) => ! granted.has( scope ) );

}

export function formatDropboxScopeSetupError( clientId, missingScopes ) {

	const scopeList = missingScopes.join( ', ' );
	return (
		`Dropbox did not grant required permissions (${ scopeList }). `
		+ `Open dropbox.com/developers/apps, select app ${ clientId }, enable those scopes on `
		+ 'Permissions, click Submit, revoke the app at dropbox.com/account/connected_apps, '
		+ 'then disconnect and sign in again.'
	);

}

/** Build-time app key: host config, `BONSAI_DROPBOX_CLIENT_ID`, or `VITE_DROPBOX_CLIENT_ID`. */
export function readBundledDropboxClientId() {

	if ( configuredClientId ) return configuredClientId;
	const fromGlobal = globalThis.BONSAI_DROPBOX_CLIENT_ID;
	if ( typeof fromGlobal === 'string' && fromGlobal.trim() ) return fromGlobal.trim();
	const fromEnv = import.meta.env?.VITE_DROPBOX_CLIENT_ID;
	return typeof fromEnv === 'string' ? fromEnv.trim() : '';

}

export function hasBundledDropboxClientId() {

	return readBundledDropboxClientId().length > 0;

}

export function normalizeSyncFolderPath( path ) {

	const trimmed = String( path ?? '' ).trim() || DEFAULT_SYNC_FOLDER;
	const withSlash = trimmed.startsWith( '/' ) ? trimmed : `/${ trimmed }`;
	return withSlash.replace( /\/+$/, '' ) || DEFAULT_SYNC_FOLDER;

}

export function joinSyncPath( folder, relativePath ) {

	const base = normalizeSyncFolderPath( folder );
	const rel = String( relativePath ?? '' ).replace( /^\/+/, '' );
	return rel ? `${ base }/${ rel }` : base;

}
