import ops from '../../ops.js';
import tool from '../../tool/index.js';

const AsyncFunction = Object.getPrototypeOf( async function () {} ).constructor;

/**
 * The `bonsai` object user scripts see. `ops` is bound to the context, so
 * scripts call `bonsai.ops.execute( 'viewer.view_all' )` without passing it.
 * @param {object} context
 */
export function scriptScope( context ) {

	return {
		context,
		tool,
		ops: {
			execute: ( name, ...args ) => ops.execute( name, context, ...args ),
			undo: () => ops.undo()?.constructor.operatorName ?? null,
			redo: () => ops.redo()?.constructor.operatorName ?? null,
			list: () => [ ...ops.registry.keys() ].sort(),
		},
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

	let names = [];
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
 * Run user-supplied JavaScript with `bonsai` (see scriptScope) in scope.
 * @param {object} context - the Bonsai context
 * @param {string} code
 * @param {{ asExpression?: boolean }} [options]
 */
export async function runUserCode( context, code, { asExpression = false } = {} ) {

	const bonsai = scriptScope( context );
	const body = asExpression ? `return (${ code })` : code;

	try {

		const fn = new AsyncFunction( 'bonsai', body );
		const value = await fn( bonsai );
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
