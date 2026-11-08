import { store } from '../../context/store.js';
import ops from '../../ops.js';
import tool from '../../tool/index.js';
import { commandCatalog, toExpression } from './commands.js';

const AsyncFunction = Object.getPrototypeOf( async function () {} ).constructor;

/**
 * The `bonsai` object user scripts see: `bonsai.ops.Viewer.ViewAll()`,
 * `bonsai.tool.Ifc.get()`, `bonsai.context.activeObject`, `bonsai.store.models`.
 * @param {object} context
 */
export function scriptScope( context ) {

	return { context, store, tool, ops };

}

// `walls = …` or `let walls = …` at the top level of a terminal line.
const ASSIGNMENT = /^\s*(?:(?:let|const|var)\s+)?([A-Za-z_][\w$]*)\s*=(?![=>])\s*([\s\S]+)$/;

// Case-insensitive, so `Viewer.togglegrid()` finds Viewer.ToggleGrid.
function categoryProxy( category ) {

	return new Proxy( category, {
		get( target, key, receiver ) {

			if ( typeof key !== 'string' || key in target ) return Reflect.get( target, key, receiver );
			const lower = key.toLowerCase();
			const match = Object.keys( target ).find( ( name ) => name.toLowerCase() === lower );
			return match ? target[ match ] : undefined;

		},
	} );

}

/** The ops categories by name: `Viewer`, `Scene`, `Project`… */
export function commandCategories() {

	const categories = {};
	for ( const name of ops.registry.keys() ) {

		const category = name.split( '.' )[ 0 ];
		categories[ category ] ??= categoryProxy( ops[ category ] );

	}

	return categories;

}

function safely( read ) {

	try {

		return read();

	} catch {

		return undefined;

	}

}

/**
 * Everything a terminal line sees: `bonsai`, the ops categories, the
 * session's own variables, and `$sel` (selected ids), `$entity`, `$model`,
 * `$last` (the previous result).
 * @param {object} context
 * @param {object} [vars] - the terminal session's variables
 */
export function commandScope( context, vars = {} ) {

	return {
		...vars,
		bonsai: scriptScope( context ),
		...commandCategories(),
		$sel: safely( () => tool.Viewer.get()?.getSelection() ) ?? [],
		$entity: safely( () => tool.Ifc.entity() ) ?? null,
		$model: safely( () => tool.Ifc.get() ) ?? null,
		$last: vars.$last,
	};

}

// A live ifcopenshell File or EntityInstance has no enumerable fields, so
// JSON.stringify would print `{}` and the terminal would look empty.
function describeIfcFile( value ) {

	if ( ! value || typeof value.schema !== 'function' || typeof value.byGuid !== 'function' ) return null;
	try {

		const schema = typeof value.schemaIdentifier === 'function' ? value.schemaIdentifier() : value.schema();
		return `IfcFile ${ schema }`;

	} catch {

		return 'IfcFile';

	}

}

function isIfcEntity( value ) {

	return !! value
		&& typeof value === 'object'
		&& typeof value.isA === 'function'
		&& typeof value.id === 'function'
		&& typeof value.get === 'function';

}

function entityLabel( entity ) {

	try {

		return `#${ entity.id() }=${ entity.isA() }`;

	} catch {

		return 'IfcEntity';

	}

}

// One level of attributes. Nested entities stay labels so a placement
// chain or an inverse cycle cannot blow the serializer.
function entitySnapshot( entity ) {

	const info = {};
	try {

		info.id = entity.id();
		info.type = entity.isA();

	} catch {

		return 'IfcEntity';

	}

	let names;
	try {

		names = entity.attributes?.() ?? [];

	} catch {

		return info;

	}

	for ( const name of names ) {

		try {

			info[ name ] = previewValue( entity.get( name ) );

		} catch {

			info[ name ] = null;

		}

	}

	return info;

}

function previewValue( value ) {

	if ( isIfcEntity( value ) ) return entityLabel( value );
	if ( Array.isArray( value ) ) return value.map( previewValue );
	if ( typeof value === 'bigint' ) return value.toString();
	return value;

}

function describeIfcValue( value ) {

	const fileLabel = describeIfcFile( value );
	if ( fileLabel ) return fileLabel;
	if ( typeof value === 'bigint' ) return value.toString();
	if ( isIfcEntity( value ) ) return entitySnapshot( value );
	return value;

}

/**
 * Run user-supplied JavaScript with commandScope in scope. As an expression,
 * a command line (`SetStandardView TOP`) runs as its operator call. With
 * `vars`, a top-level `name = …` is kept there, and so is the last result.
 * @param {object} context - the Bonsai context
 * @param {string} code
 * @param {{ asExpression?: boolean, vars?: object }} [options]
 */
export async function runUserCode( context, code, { asExpression = false, vars = null } = {} ) {

	const scope = commandScope( context, vars ?? {} );
	let source = code;
	let target = null;

	if ( asExpression ) {

		const assignment = vars ? ASSIGNMENT.exec( code ) : null;
		const reserved = assignment && ( assignment[ 1 ] === 'bonsai' || Object.hasOwn( commandCategories(), assignment[ 1 ] ) );
		if ( reserved ) return { success: false, error: `${ assignment[ 1 ] } is reserved and cannot be assigned`, value: undefined };
		if ( assignment ) {

			target = assignment[ 1 ];
			source = assignment[ 2 ];

		}

		const isVariable = ( name ) => Object.hasOwn( scope, name );
		source = toExpression( source, commandCatalog( ops.registry ), isVariable ) ?? source;

	}

	const body = asExpression ? `return (${ source })` : source;
	const names = Object.keys( scope );

	try {

		const fn = new AsyncFunction( ...names, body );
		const value = await fn( ...names.map( ( name ) => scope[ name ] ) );
		if ( vars ) {

			if ( target ) vars[ target ] = value;
			if ( value !== undefined ) vars.$last = value;

		}

		return { success: true, value };

	} catch ( err ) {

		return { success: false, error: err.message, value: undefined };

	}

}

/**
 * Format the result of runUserCode as a display string.
 * @param {{ success: boolean, value?: any, error?: string }} result
 */
export function formatRunOutput( result ) {

	if ( ! result.success ) return result.error ?? 'Error';
	if ( result.value === undefined ) return '';

	const fileLabel = describeIfcFile( result.value );
	if ( fileLabel ) return fileLabel;

	try {

		return JSON.stringify( result.value, ( _key, value ) => describeIfcValue( value ), 2 );

	} catch {

		return String( result.value );

	}

}
