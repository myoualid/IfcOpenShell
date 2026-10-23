import {
	DROPBOX_OAUTH_SCOPES,
	formatDropboxScopeSetupError,
	missingDropboxRequiredScopes,
} from './const.js';

const OAUTH_VERIFIER_KEY = 'bonsai-web:dropbox:oauth-verifier';
const DROPBOX_AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';

function requireCrypto() {

	if ( typeof crypto === 'undefined' || ! crypto.subtle ) {

		throw new Error( 'Web Crypto API is unavailable.' );

	}

	return crypto;

}

function base64UrlEncode( bytes ) {

	let binary = '';
	for ( const byte of bytes ) binary += String.fromCharCode( byte );
	return btoa( binary ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );

}

export function createCodeVerifier() {

	const bytes = requireCrypto().getRandomValues( new Uint8Array( 32 ) );
	return base64UrlEncode( bytes );

}

export async function createCodeChallenge( verifier ) {

	const digest = await requireCrypto().subtle.digest( 'SHA-256', new TextEncoder().encode( verifier ) );
	return base64UrlEncode( new Uint8Array( digest ) );

}

export async function buildAuthorizeUrl( clientId, verifier ) {

	const challenge = await createCodeChallenge( verifier );
	const params = new URLSearchParams( {
		client_id: clientId,
		response_type: 'code',
		code_challenge: challenge,
		code_challenge_method: 'S256',
		token_access_type: 'offline',
	} );
	return `${ DROPBOX_AUTHORIZE_URL }?${ params.toString() }`;

}

export function storePendingOAuthVerifier( verifier ) {

	if ( typeof sessionStorage === 'undefined' ) throw new Error( 'sessionStorage is unavailable.' );
	sessionStorage.setItem( OAUTH_VERIFIER_KEY, verifier );

}

export function readPendingOAuthVerifier() {

	if ( typeof sessionStorage === 'undefined' ) return null;
	return sessionStorage.getItem( OAUTH_VERIFIER_KEY );

}

export function clearPendingOAuth() {

	if ( typeof sessionStorage === 'undefined' ) return;
	sessionStorage.removeItem( OAUTH_VERIFIER_KEY );

}

/** Accept a raw code or a pasted callback URL that contains `code=`. */
export function normalizeAuthCodeInput( input ) {

	const trimmed = String( input ?? '' ).trim();
	if ( ! trimmed ) return null;

	try {

		const parsedUrl = new URL( trimmed );
		const codeFromUrl = parsedUrl.searchParams.get( 'code' );
		if ( codeFromUrl ) return codeFromUrl;

	} catch {

		// Not a URL.

	}

	const codeMatch = trimmed.match( /(?:^|[?&#])code=([^&#]+)/i );
	if ( codeMatch?.[ 1 ] ) {

		try {

			return decodeURIComponent( codeMatch[ 1 ] );

		} catch {

			return codeMatch[ 1 ];

		}

	}

	return trimmed;

}

export function assertDropboxTokenScopes( clientId, scopeField ) {

	if ( ! scopeField?.trim() ) return;
	const missing = missingDropboxRequiredScopes( scopeField );
	if ( missing.length === 0 ) return;
	throw new Error( formatDropboxScopeSetupError( clientId, missing ) );

}

export async function exchangeAuthorizationCode( clientId, code, verifier ) {

	const body = new URLSearchParams( {
		grant_type: 'authorization_code',
		code,
		code_verifier: verifier,
		client_id: clientId,
	} );

	const response = await fetch( DROPBOX_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	} );

	if ( ! response.ok ) throw new Error( `Dropbox token exchange failed (${ response.status }).` );

	const payload = await response.json();
	assertDropboxTokenScopes( clientId, payload.scope );
	return payload;

}

export async function refreshAccessToken( clientId, refreshToken ) {

	const body = new URLSearchParams( {
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
		client_id: clientId,
		scope: DROPBOX_OAUTH_SCOPES,
	} );

	const response = await fetch( DROPBOX_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	} );

	if ( ! response.ok ) throw new Error( `Dropbox token refresh failed (${ response.status }).` );

	const payload = await response.json();
	assertDropboxTokenScopes( clientId, payload.scope );
	return payload;

}

export async function createDropboxAuthSession( clientId ) {

	// Reuse the verifier for this tab so a second click does not invalidate
	// the Dropbox page the user already has open. Cleared after exchange,
	// cancel, or disconnect. It is not a Dropbox credential by itself.
	let verifier = readPendingOAuthVerifier();
	if ( ! verifier ) {

		verifier = createCodeVerifier();
		storePendingOAuthVerifier( verifier );

	}

	const authUrl = await buildAuthorizeUrl( clientId, verifier );
	return { authUrl, codeVerifier: verifier };

}

export async function completeDropboxAuthWithCode( clientId, authCodeInput ) {

	const verifier = readPendingOAuthVerifier();
	if ( ! verifier ) throw new Error( 'Authentication session expired. Start sign-in again.' );

	const code = normalizeAuthCodeInput( authCodeInput );
	if ( ! code ) throw new Error( 'Paste the authorization code from Dropbox.' );

	const tokens = await exchangeAuthorizationCode( clientId, code, verifier );
	clearPendingOAuth();
	return tokens;

}

export function openDropboxAuthorizationPage( authUrl ) {

	if ( typeof window === 'undefined' || ! authUrl ) return false;
	window.open( authUrl, '_blank', 'noopener,noreferrer' );
	return true;

}
