// bonsai.tool.Terminal — in-memory JavaScript REPL sessions.
// Operators create, run, and clear them. The panel lists them.

function newGuid() {

	if ( typeof crypto !== 'undefined' && crypto.randomUUID ) {

		return crypto.randomUUID();

	}

	return `term-${ Date.now() }-${ Math.random().toString( 16 ).slice( 2 ) }`;

}

const sessions = new Map();
let nextIndex = 1;

export class Terminal {

	static create( name ) {

		const session = {
			guid: newGuid(),
			name: name || `Terminal ${ nextIndex ++ }`,
			history: [],
			commandHistory: [],
		};
		sessions.set( session.guid, session );
		return session;

	}

	static list() {

		return [ ...sessions.values() ];

	}

	static get( guid ) {

		return sessions.get( guid ) ?? null;

	}

	static append( guid, command, output, success ) {

		const session = sessions.get( guid );
		if ( ! session ) return;
		session.history.push( { command, output, success } );
		if ( command.trim() ) session.commandHistory.push( command );

	}

	static clear( guid ) {

		const session = sessions.get( guid );
		if ( ! session ) return;
		session.history = [];

	}

	static detach( guid ) {

		const keys = [ ...sessions.keys() ];
		const index = keys.indexOf( guid );
		const session = sessions.get( guid );
		if ( ! session || index < 0 ) return null;
		sessions.delete( guid );
		return { session, index };

	}

	static attach( session, index ) {

		if ( index == null || index >= sessions.size ) {

			sessions.set( session.guid, session );
			return session;

		}

		const entries = [ ...sessions.entries() ];
		entries.splice( index, 0, [ session.guid, session ] );
		sessions.clear();
		for ( const [ guid, item ] of entries ) sessions.set( guid, item );
		return session;

	}

}

export default Terminal;
