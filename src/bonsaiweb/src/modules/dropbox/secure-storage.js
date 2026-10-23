/**
 * Credential blobs for this origin.
 *
 * Values are AES-GCM ciphertext in localStorage. The key is a random 32-byte
 * value in IndexedDB on the same origin. That stops a casual copy of
 * localStorage from revealing tokens. It is not a boundary against script
 * running on this page: that script can read both stores. There is no
 * server and no user password. See README.md in this folder.
 */

const STORAGE_NAMESPACE = 'bonsai-web-connectors';
const KEY_DB_NAME = 'bonsai-web-connectors-keys';
const KEY_STORE = 'master';
const MASTER_KEY_ID = 'v1';

function requireCrypto() {

	if ( typeof crypto === 'undefined' || ! crypto.subtle ) {

		throw new Error( 'Web Crypto API is unavailable in this environment.' );

	}

	return crypto;

}

function bytesToBase64( bytes ) {

	let binary = '';
	for ( const byte of bytes ) binary += String.fromCharCode( byte );
	return btoa( binary );

}

function base64ToBytes( value ) {

	const binary = atob( value );
	const bytes = new Uint8Array( binary.length );
	for ( let index = 0; index < binary.length; index += 1 ) {

		bytes[ index ] = binary.charCodeAt( index );

	}

	return bytes;

}

async function hashStorageKey( namespace, key ) {

	const material = new TextEncoder().encode( `${ STORAGE_NAMESPACE }:${ namespace }:${ key }` );
	const digest = await requireCrypto().subtle.digest( 'SHA-256', material );
	return Array.from( new Uint8Array( digest ) )
		.map( ( byte ) => byte.toString( 16 ).padStart( 2, '0' ) )
		.join( '' );

}

function openKeyDatabase() {

	return new Promise( ( resolve, reject ) => {

		const request = indexedDB.open( KEY_DB_NAME, 1 );
		request.onupgradeneeded = () => {

			const db = request.result;
			if ( ! db.objectStoreNames.contains( KEY_STORE ) ) db.createObjectStore( KEY_STORE );

		};

		request.onsuccess = () => resolve( request.result );
		request.onerror = () => reject( request.error ?? new Error( 'Failed to open connector key store.' ) );

	} );

}

async function readMasterKeyRaw() {

	const db = await openKeyDatabase();
	return new Promise( ( resolve, reject ) => {

		const tx = db.transaction( KEY_STORE, 'readonly' );
		const request = tx.objectStore( KEY_STORE ).get( MASTER_KEY_ID );
		request.onsuccess = () => {

			const value = request.result;
			resolve( value instanceof Uint8Array ? value : null );

		};

		request.onerror = () => reject( request.error ?? new Error( 'Failed to read connector master key.' ) );

	} );

}

async function writeMasterKeyRaw( rawKey ) {

	const db = await openKeyDatabase();
	return new Promise( ( resolve, reject ) => {

		const tx = db.transaction( KEY_STORE, 'readwrite' );
		tx.objectStore( KEY_STORE ).put( rawKey, MASTER_KEY_ID );
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject( tx.error ?? new Error( 'Failed to write connector master key.' ) );

	} );

}

async function importMasterKey( rawKey ) {

	const keyBytes = new Uint8Array( rawKey );
	return requireCrypto().subtle.importKey( 'raw', keyBytes, 'AES-GCM', false, [ 'encrypt', 'decrypt' ] );

}

async function getMasterKey() {

	let rawKey = await readMasterKeyRaw();
	if ( ! rawKey ) {

		rawKey = requireCrypto().getRandomValues( new Uint8Array( 32 ) );
		await writeMasterKeyRaw( rawKey );

	}

	return importMasterKey( rawKey );

}

function readPayload( storageKey ) {

	if ( typeof localStorage === 'undefined' ) return null;
	try {

		const raw = localStorage.getItem( storageKey );
		if ( ! raw ) return null;
		const parsed = JSON.parse( raw );
		if ( ! parsed?.iv || ! parsed?.ciphertext ) return null;
		return parsed;

	} catch {

		return null;

	}

}

function writePayload( storageKey, payload ) {

	if ( typeof localStorage === 'undefined' ) throw new Error( 'localStorage is unavailable.' );
	localStorage.setItem( storageKey, JSON.stringify( payload ) );

}

function removePayload( storageKey ) {

	if ( typeof localStorage === 'undefined' ) return;
	localStorage.removeItem( storageKey );

}

export async function saveSecureJson( namespace, key, value ) {

	const storageKey = await hashStorageKey( namespace, key );
	const masterKey = await getMasterKey();
	const iv = requireCrypto().getRandomValues( new Uint8Array( 12 ) );
	const plaintext = new TextEncoder().encode( JSON.stringify( value ) );
	const ciphertext = await requireCrypto().subtle.encrypt( { name: 'AES-GCM', iv }, masterKey, plaintext );
	writePayload( storageKey, {
		iv: bytesToBase64( iv ),
		ciphertext: bytesToBase64( new Uint8Array( ciphertext ) ),
	} );

}

export async function loadSecureJson( namespace, key ) {

	const storageKey = await hashStorageKey( namespace, key );
	const payload = readPayload( storageKey );
	if ( ! payload ) return null;

	const masterKey = await getMasterKey();
	const plaintext = await requireCrypto().subtle.decrypt(
		{ name: 'AES-GCM', iv: base64ToBytes( payload.iv ) },
		masterKey,
		base64ToBytes( payload.ciphertext ),
	);
	return JSON.parse( new TextDecoder().decode( plaintext ) );

}

export async function removeSecureJson( namespace, key ) {

	const storageKey = await hashStorageKey( namespace, key );
	removePayload( storageKey );

}
