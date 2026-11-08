// This file was generated with the assistance of an AI coding tool.

// Command lookup for the terminal and its command bar: the operator catalog,
// fuzzy matching, AutoCAD-style `Command arg arg` lines, and completions.
// No DOM and no gui, so it stays testable and headless.

const IDENT = /^[A-Za-z_$][\w$]*$/;
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const WORDS = { true: 'true', false: 'false', null: 'null', undefined: 'undefined', on: 'true', off: 'false' };
const CLOSERS = { '(': ')', '[': ']', '{': '}' };

/**
 * One entry per registered operator, sorted by name.
 * @param {Map<string, Function>} registry - ops.registry
 */
export function commandCatalog( registry ) {

	const catalog = [];
	for ( const [ name, OperatorClass ] of registry ) {

		const [ category, id ] = name.split( '.' );
		catalog.push( {
			name,
			category,
			id,
			label: OperatorClass.operatorLabel || id,
			args: OperatorClass.operatorArgs ?? [],
		} );

	}

	return catalog.sort( ( a, b ) => a.name.localeCompare( b.name ) );

}

/**
 * `Viewer.ToggleGrid`, `viewer.togglegrid`, or `ToggleGrid` when only one
 * category has it. Case-insensitive; null when nothing or several match.
 */
export function resolveCommand( word, catalog ) {

	const lower = String( word ?? '' ).toLowerCase();
	if ( ! lower ) return null;
	const full = catalog.find( ( command ) => command.name.toLowerCase() === lower );
	if ( full || lower.includes( '.' ) ) return full ?? null;
	const byId = catalog.filter( ( command ) => command.id.toLowerCase() === lower );
	return byId.length === 1 ? byId[ 0 ] : null;

}

function isSubsequence( query, text ) {

	let i = 0;
	for ( const char of text ) {

		if ( char === query[ i ] ) i ++;
		if ( i === query.length ) return true;

	}

	return false;

}

function score( query, command ) {

	const name = command.name.toLowerCase();
	const id = command.id.toLowerCase();
	const label = command.label.toLowerCase();
	if ( name === query || id === query ) return 100;
	if ( id.startsWith( query ) ) return 80;
	if ( name.startsWith( query ) ) return 75;
	if ( id.includes( query ) ) return 60;
	if ( label.split( /\s+/ ).some( ( word ) => word.startsWith( query ) ) ) return 50;
	if ( name.includes( query ) || label.includes( query ) ) return 40;
	if ( isSubsequence( query, id ) ) return 20;
	return 0;

}

/**
 * Commands matching what was typed, best first: `grid` finds
 * Viewer.ToggleGrid, `top` finds Viewer.SetStandardView by its label.
 */
export function matchCommands( query, catalog, limit = 12 ) {

	const q = String( query ?? '' ).toLowerCase();
	if ( ! q ) return [];
	return catalog
		.map( ( command ) => ( { command, score: score( q, command ) } ) )
		.filter( ( item ) => item.score > 0 )
		.sort( ( a, b ) => b.score - a.score || a.command.name.localeCompare( b.command.name ) )
		.slice( 0, limit )
		.map( ( item ) => item.command );

}

/**
 * Split on whitespace, keeping quoted strings and bracketed groups whole:
 * `$sel '#f40' [1, 2]` is three tokens. An unclosed token runs to the end.
 * @returns {{ text: string, start: number, end: number }[]}
 */
export function tokenize( text ) {

	const tokens = [];
	let i = 0;
	while ( i < text.length ) {

		if ( /\s/.test( text[ i ] ) ) {

			i ++;
			continue;

		}

		const start = i;
		const stack = [];
		let quote = null;
		while ( i < text.length ) {

			const char = text[ i ];
			if ( quote ) {

				if ( char === '\\' ) i ++;
				else if ( char === quote ) quote = null;

			} else if ( char === '\'' || char === '"' || char === '`' ) {

				quote = char;

			} else if ( CLOSERS[ char ] ) {

				stack.push( CLOSERS[ char ] );

			} else if ( char === stack.at( - 1 ) ) {

				stack.pop();

			} else if ( stack.length === 0 && /\s/.test( char ) ) {

				break;

			}

			i ++;

		}

		tokens.push( { text: text.slice( start, i ), start, end: i } );

	}

	return tokens;

}

// One command-line word as JavaScript: quoted, bracketed, numbers, booleans
// and variables pass through; any other bare word becomes a string.
function argSource( word, isVariable ) {

	if ( /^['"`[{(]/.test( word ) ) return word;
	if ( Object.hasOwn( WORDS, word.toLowerCase() ) ) return WORDS[ word.toLowerCase() ];
	if ( NUMBER.test( word ) ) return word;
	const head = /^[A-Za-z_$][\w$]*/.exec( word )?.[ 0 ];
	if ( head && ( head.startsWith( '$' ) || isVariable( head ) ) ) return word;
	return JSON.stringify( word );

}

function leadingCommand( text, catalog, isVariable ) {

	const match = /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)(?=\s|$)/.exec( text );
	if ( ! match || isVariable( match[ 1 ] ) ) return null;
	const command = resolveCommand( match[ 1 ], catalog );
	if ( ! command ) return null;
	const rest = text.slice( match[ 0 ].length );
	if ( /^\s*[=.(,;?:*/%<>!&|]/.test( rest ) ) return null;
	return { command, rest, restStart: match[ 0 ].length };

}

/**
 * Turn `SetStandardView TOP` or `Viewer.ToggleGrid off` into
 * `Viewer.SetStandardView("TOP")`. Null when the text is not a command line,
 * so it runs as plain JavaScript.
 * @param {string} text
 * @param {object[]} catalog - from commandCatalog
 * @param {(name: string) => boolean} [isVariable] - names in scope
 */
export function toExpression( text, catalog, isVariable = () => false ) {

	const line = leadingCommand( text, catalog, isVariable );
	if ( ! line ) return null;
	const args = tokenize( line.rest ).map( ( token ) => argSource( token.text, isVariable ) );
	return `${ line.command.category }.${ line.command.id }(${ args.join( ', ' ) })`;

}

/**
 * Which argument the cursor is on, in `Viewer.SetColor($sel, '#f` (code)
 * or `SetColor $sel #f` (line). `partial` is the text typed for it so far,
 * from `partialStart` to the cursor. Null outside a command's arguments.
 */
export function commandContext( text, cursor, catalog ) {

	const before = text.slice( 0, cursor ?? text.length );

	// Code form: the innermost open paren that follows a command name.
	const frames = [];
	let quote = null;
	for ( let i = 0; i < before.length; i ++ ) {

		const char = before[ i ];
		if ( quote ) {

			if ( char === '\\' ) i ++;
			else if ( char === quote ) quote = null;

		} else if ( char === '\'' || char === '"' || char === '`' ) {

			quote = char;

		} else if ( CLOSERS[ char ] ) {

			frames.push( { close: CLOSERS[ char ], open: i, argIndex: 0, argStart: i + 1 } );

		} else if ( char === frames.at( - 1 )?.close ) {

			frames.pop();

		} else if ( char === ',' && frames.length ) {

			const frame = frames.at( - 1 );
			frame.argIndex ++;
			frame.argStart = i + 1;

		}

	}

	const frame = frames.at( - 1 );
	if ( frame?.close === ')' ) {

		const command = resolveCommand( extractChain( before, frame.open ), catalog );
		if ( ! command ) return null;
		const lead = before.slice( frame.argStart ).match( /^\s*/ )[ 0 ].length;
		const partialStart = frame.argStart + lead;
		return { command, form: 'code', argIndex: frame.argIndex, partial: before.slice( partialStart ), partialStart };

	}

	if ( frames.length ) return null;

	// Line form: needs the space after the command name.
	const line = leadingCommand( before, catalog, () => false );
	if ( ! line || ! /\s/.test( line.rest[ 0 ] ?? '' ) ) return null;
	const tokens = tokenize( line.rest );
	const last = tokens.at( - 1 );
	if ( ! last || /\s$/.test( before ) ) {

		return { command: line.command, form: 'line', argIndex: tokens.length, partial: '', partialStart: before.length };

	}

	return {
		command: line.command,
		form: 'line',
		argIndex: tokens.length - 1,
		partial: last.text,
		partialStart: line.restStart + last.start,
	};

}

function quoteValue( value, form ) {

	const text = String( value );
	if ( form === 'code' ) return JSON.stringify( text ).replaceAll( '"', '\'' );
	return /\s/.test( text ) ? JSON.stringify( text ) : text;

}

/**
 * Values to offer for the argument at the cursor: enum options, true/false,
 * `$sel` for ids. Each has the text to insert in place of `partial`.
 */
export function argSuggestions( ctx ) {

	const arg = ctx?.command.args[ ctx.argIndex ] ?? null;
	if ( ! arg ) return { arg, items: [] };

	let values = [];
	if ( arg.type === 'enum' ) values = arg.options.map( ( value ) => ( { label: String( value ), insert: quoteValue( value, ctx.form ) } ) );
	else if ( arg.type === 'boolean' ) values = [ 'true', 'false' ].map( ( value ) => ( { label: value, insert: value } ) );
	else if ( arg.type === 'ids' ) values = [ { label: '$sel', insert: '$sel' } ];

	const typed = ctx.partial.replace( /^['"`]/, '' ).toLowerCase();
	const items = values.filter( ( item ) => item.label.toLowerCase().startsWith( typed ) );
	return { arg, items };

}

/** `view: FRONT|BACK|…`, `on?: boolean`, for the hint line and menu. */
export function formatArg( arg ) {

	const type = arg.type === 'enum' ? arg.options.join( '|' ) : arg.type;
	return `${ arg.name }${ arg.optional ? '?' : '' }: ${ type }`;

}

export function formatSignature( command ) {

	return command.args.map( formatArg ).join( ', ' );

}

/** The `a.b.c` chain that ends at the cursor. */
export function extractChain( text, cursorPos ) {

	let i = cursorPos;
	while ( i > 0 && /[\w$.]/.test( text[ i - 1 ] ) ) i --;
	return text.slice( i, cursorPos );

}

function allProps( obj ) {

	const seen = new Set();
	let cur = obj;
	while ( cur != null ) {

		for ( const key of Object.getOwnPropertyNames( cur ) ) {

			if ( ! key.startsWith( '__' ) ) seen.add( key );

		}

		cur = Object.getPrototypeOf( cur );
		if ( cur === Object.prototype ) break;

	}

	return [ ...seen ].sort();

}

/**
 * Property completions for the chain at the cursor, evaluated against
 * `scope` (name → value). A bare word completes from `topLevel`.
 */
export function getCompletions( text, cursor, scope, topLevel ) {

	cursor = cursor ?? text.length;
	const chain = extractChain( text, cursor );
	const dotIdx = chain.lastIndexOf( '.' );

	if ( dotIdx === - 1 ) {

		const partial = chain;
		const completions = partial
			? topLevel.filter( ( k ) => k.startsWith( partial ) && k !== partial )
			: [];
		return { completions, chain, partial };

	}

	const objExpr = chain.slice( 0, dotIdx );
	const partial = chain.slice( dotIdx + 1 );
	if ( ! objExpr ) return { completions: [], chain, partial };

	try {

		const names = Object.keys( scope ).filter( ( name ) => IDENT.test( name ) );
		const fn = new Function( ...names, `return (${ objExpr })` );
		const obj = fn( ...names.map( ( name ) => scope[ name ] ) );
		if ( obj == null ) return { completions: [], chain, partial };
		const completions = allProps( obj ).filter(
			( k ) => ! partial || k.startsWith( partial ),
		);
		return { completions, chain, partial };

	} catch {

		return { completions: [], chain, partial };

	}

}

export function applyCompletion( text, cursor, chain, completion ) {

	cursor = cursor ?? text.length;
	const dotIdx = chain.lastIndexOf( '.' );
	const keep = dotIdx === - 1 ? '' : chain.slice( 0, dotIdx + 1 );
	const before = text.slice( 0, cursor - chain.length );
	const after = text.slice( cursor );
	const newText = before + keep + completion;
	return { text: newText + after, cursor: newText.length };

}
