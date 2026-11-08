/**
 * Local sync queue and revision cache.
 * Dropbox holds the files. IndexedDB holds metadata and the offline upload queue.
 */

const DB_NAME = 'bonsai-cloud-sync-v1';
const DB_VERSION = 1;
const PENDING_STORE = 'pending-uploads';
const REV_STORE = 'file-revisions';

function openDatabase() {

	return new Promise( ( resolve, reject ) => {

		const request = indexedDB.open( DB_NAME, DB_VERSION );
		request.onupgradeneeded = () => {

			const db = request.result;
			if ( ! db.objectStoreNames.contains( PENDING_STORE ) ) {

				db.createObjectStore( PENDING_STORE, { keyPath: 'id' } );

			}

			if ( ! db.objectStoreNames.contains( REV_STORE ) ) {

				db.createObjectStore( REV_STORE, { keyPath: 'path' } );

			}

		};

		request.onsuccess = () => resolve( request.result );
		request.onerror = () => reject( request.error ?? new Error( 'Failed to open cloud sync database.' ) );

	} );

}

function runTransaction( storeName, mode, fn ) {

	return openDatabase().then( ( db ) => new Promise( ( resolve, reject ) => {

		const tx = db.transaction( storeName, mode );
		const store = tx.objectStore( storeName );
		const request = fn( store );
		tx.oncomplete = () => resolve( request instanceof IDBRequest ? request.result : undefined );
		tx.onerror = () => reject( tx.error ?? new Error( 'Cloud sync transaction failed.' ) );

	} ) );

}

export async function queuePendingUpload( entry ) {

	await runTransaction( PENDING_STORE, 'readwrite', ( store ) => store.put( entry ) );

}

export async function listPendingUploads() {

	const db = await openDatabase();
	return new Promise( ( resolve, reject ) => {

		const tx = db.transaction( PENDING_STORE, 'readonly' );
		const request = tx.objectStore( PENDING_STORE ).getAll();
		request.onsuccess = () => resolve( request.result ?? [] );
		request.onerror = () => reject( request.error ?? new Error( 'Failed to list pending uploads.' ) );

	} );

}

export async function removePendingUpload( id ) {

	await runTransaction( PENDING_STORE, 'readwrite', ( store ) => store.delete( id ) );

}

export async function setCachedRevision( entry ) {

	await runTransaction( REV_STORE, 'readwrite', ( store ) => store.put( entry ) );

}

export async function getCachedRevision( path ) {

	const result = await runTransaction( REV_STORE, 'readonly', ( store ) => store.get( path ) );
	return result ?? null;

}

export async function clearSyncStore() {

	const db = await openDatabase();
	await new Promise( ( resolve, reject ) => {

		const tx = db.transaction( [ PENDING_STORE, REV_STORE ], 'readwrite' );
		tx.objectStore( PENDING_STORE ).clear();
		tx.objectStore( REV_STORE ).clear();
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject( tx.error ?? new Error( 'Failed to clear cloud sync store.' ) );

	} );

}
