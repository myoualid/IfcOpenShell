// This file was generated with the assistance of an AI coding tool.

// Command bar parsing: catalog, matching, `Command arg` lines, arg context.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	argSuggestions,
	commandCatalog,
	commandContext,
	matchCommands,
	resolveCommand,
	tokenize,
	toExpression,
} from '../src/modules/code.scripting/commands.js';

function op( name, label, args = [] ) {
	return [ name, { operatorName: name, operatorLabel: label, operatorArgs: args } ];
}

const registry = new Map( [
	op( 'Viewer.ToggleGrid', 'Toggle Grid', [ { name: 'on', type: 'boolean', optional: true } ] ),
	op( 'Viewer.SetStandardView', 'Standard View', [ { name: 'view', type: 'enum', options: [ 'FRONT', 'TOP', 'BOTTOM' ] } ] ),
	op( 'Viewer.SetColor', 'Set Color', [ { name: 'ids', type: 'ids' }, { name: 'color', type: 'color' } ] ),
	op( 'Viewer.ViewAll', 'View All' ),
	op( 'Settings.Toggle', 'Toggle Settings' ),
	op( 'Dropbox.Toggle', 'Toggle Dropbox' ),
] );
const catalog = commandCatalog( registry );

test( 'resolveCommand is case-insensitive and needs a unique id', () => {
	assert.equal( resolveCommand( 'viewer.togglegrid', catalog ).name, 'Viewer.ToggleGrid' );
	assert.equal( resolveCommand( 'ToggleGrid', catalog ).name, 'Viewer.ToggleGrid' );
	assert.equal( resolveCommand( 'Toggle', catalog ), null );
	assert.equal( resolveCommand( 'Settings.Toggle', catalog ).name, 'Settings.Toggle' );
} );

test( 'matchCommands ranks id prefixes, labels and fuzzy hits', () => {
	assert.equal( matchCommands( 'grid', catalog )[ 0 ].name, 'Viewer.ToggleGrid' );
	assert.equal( matchCommands( 'standard', catalog )[ 0 ].name, 'Viewer.SetStandardView' );
	assert.equal( matchCommands( 'viewer.view', catalog )[ 0 ].name, 'Viewer.ViewAll' );
	assert.equal( matchCommands( 'tgrid', catalog )[ 0 ].name, 'Viewer.ToggleGrid' );
	assert.deepEqual( matchCommands( '', catalog ), [] );
} );

test( 'tokenize keeps quotes and brackets whole', () => {
	const tokens = tokenize( `$sel '#f 40' [1, 2] {a: 'b c'} plain` ).map( ( t ) => t.text );
	assert.deepEqual( tokens, [ '$sel', '\'#f 40\'', '[1, 2]', '{a: \'b c\'}', 'plain' ] );
} );

test( 'toExpression turns command lines into operator calls', () => {
	assert.equal( toExpression( 'SetStandardView TOP', catalog ), 'Viewer.SetStandardView("TOP")' );
	assert.equal( toExpression( 'viewer.togglegrid off', catalog ), 'Viewer.ToggleGrid(false)' );
	assert.equal( toExpression( 'ViewAll', catalog ), 'Viewer.ViewAll()' );
	assert.equal( toExpression( 'SetColor $sel #f40', catalog ), 'Viewer.SetColor($sel, "#f40")' );
	assert.equal( toExpression( 'SetColor walls 0.5', catalog, ( n ) => n === 'walls' ), 'Viewer.SetColor(walls, 0.5)' );
	assert.equal( toExpression( 'SetColor [1,2] \'red\'', catalog ), 'Viewer.SetColor([1,2], \'red\')' );
} );

test( 'toExpression leaves plain JavaScript alone', () => {
	assert.equal( toExpression( 'Viewer.ViewAll()', catalog ), null );
	assert.equal( toExpression( 'walls.length', catalog ), null );
	assert.equal( toExpression( 'ViewAll = 3', catalog ), null );
	assert.equal( toExpression( 'Toggle', catalog ), null );
	assert.equal( toExpression( 'ViewAll', catalog, ( n ) => n === 'ViewAll' ), null );
} );

test( 'commandContext finds the argument in code form', () => {
	const ctx = commandContext( 'Viewer.SetColor($sel, \'#f', undefined, catalog );
	assert.equal( ctx.command.name, 'Viewer.SetColor' );
	assert.equal( ctx.form, 'code' );
	assert.equal( ctx.argIndex, 1 );
	assert.equal( ctx.partial, '\'#f' );
	assert.equal( commandContext( 'Viewer.SetColor([1, 2], ', undefined, catalog ).argIndex, 1 );
	assert.equal( commandContext( 'Viewer.ViewAll()', undefined, catalog ), null );
} );

test( 'commandContext finds the argument in line form', () => {
	const text = 'SetStandardView to';
	const ctx = commandContext( text, text.length, catalog );
	assert.equal( ctx.form, 'line' );
	assert.equal( ctx.argIndex, 0 );
	assert.equal( ctx.partial, 'to' );
	assert.equal( text.slice( ctx.partialStart ), 'to' );
	assert.equal( commandContext( 'SetColor $sel ', undefined, catalog ).argIndex, 1 );
	assert.equal( commandContext( 'SetStandardView', undefined, catalog ), null );
} );

test( 'argSuggestions offers enum values, quoted in code form', () => {
	const line = argSuggestions( commandContext( 'SetStandardView t', undefined, catalog ) );
	assert.deepEqual( line.items.map( ( i ) => i.insert ), [ 'TOP' ] );
	const code = argSuggestions( commandContext( 'Viewer.SetStandardView(\'b', undefined, catalog ) );
	assert.deepEqual( code.items.map( ( i ) => i.insert ), [ '\'BOTTOM\'' ] );
	const bool = argSuggestions( commandContext( 'ToggleGrid ', undefined, catalog ) );
	assert.deepEqual( bool.items.map( ( i ) => i.label ), [ 'true', 'false' ] );
	const ids = argSuggestions( commandContext( 'SetColor ', undefined, catalog ) );
	assert.deepEqual( ids.items.map( ( i ) => i.label ), [ '$sel' ] );
} );

test( 'runUserCode runs command lines and keeps session variables', async () => {
	const { default: ops, Operator } = await import( '../src/ops.js' );
	const { runUserCode } = await import( '../src/modules/code.scripting/core.js' );

	class Echo extends Operator {
		static operatorName = 'Test.Echo';
		static operatorArgs = [ { name: 'value', type: 'string' } ];
		constructor( context, ...args ) {
			super( context );
			this.args = args;
		}
		execute() {
			return this.args;
		}
	}
	ops.register( Echo );

	const vars = {};
	assert.deepEqual( ( await runUserCode( {}, 'Echo hello 2', { asExpression: true, vars } ) ).value, [ 'hello', 2 ] );
	assert.deepEqual( vars.$last, [ 'hello', 2 ] );
	assert.deepEqual( ( await runUserCode( {}, 'Test.echo(\'x\')', { asExpression: true, vars } ) ).value, [ 'x' ] );

	await runUserCode( {}, 'walls = [1, 2, 3]', { asExpression: true, vars } );
	assert.deepEqual( vars.walls, [ 1, 2, 3 ] );
	assert.deepEqual( ( await runUserCode( {}, 'Echo walls', { asExpression: true, vars } ) ).value, [ [ 1, 2, 3 ] ] );
	assert.equal( ( await runUserCode( {}, 'walls.length + $last.length', { asExpression: true, vars } ) ).value, 4 );

	const reserved = await runUserCode( {}, 'Test = 1', { asExpression: true, vars } );
	assert.equal( reserved.success, false );
	assert.equal( Object.hasOwn( vars, 'Test' ), false );
} );
