import { DEFAULT_SYNC_FOLDER, DROPBOX_CONNECTOR_ID } from './const.js';

export function ensureDropboxState( context ) {

	if ( ! context.dropbox ) context.dropbox = {};
	const state = context.dropbox;
	state.connectorId = DROPBOX_CONNECTOR_ID;
	if ( state.browsePath == null ) state.browsePath = '';
	if ( ! state.entries ) state.entries = [];
	if ( state.accountLabel == null ) state.accountLabel = '';
	if ( state.connected == null ) state.connected = false;
	if ( ! state.view ) state.view = 'connect';
	if ( ! state.syncFolderPath ) state.syncFolderPath = DEFAULT_SYNC_FOLDER;
	if ( state.lastSyncAt == null ) state.lastSyncAt = null;
	if ( state.pendingUploadCount == null ) state.pendingUploadCount = 0;
	if ( state.usesBundledAppKey == null ) state.usesBundledAppKey = false;
	if ( state.clientId == null ) state.clientId = '';
	if ( state.clientIdPreview == null ) state.clientIdPreview = '';
	if ( state.authUrl == null ) state.authUrl = '';
	if ( state.authError == null ) state.authError = '';
	if ( state.binding == null ) state.binding = null;
	if ( ! state.localFiles ) state.localFiles = new Map();
	return state;

}
