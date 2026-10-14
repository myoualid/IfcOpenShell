import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Operator } from '../src/ops/Operator.js';
import { Ops } from '../src/ops/Ops.js';

class Increment extends Operator {

	static operatorName = 'test.increment';
	static undoable = true;

	constructor( context, by = 1 ) {

		super( context );
		this.by = by;

	}

	poll() {

		return this.by !== 0;

	}

	execute() {

		if ( this.by < 0 ) return { status: 'CANCELLED' };
		this.context.value += this.by;
		return { status: 'FINISHED', result: this.context.value };

	}

	undo() {

		this.context.value -= this.by;

	}

}

class Peek extends Operator {

	static operatorName = 'test.peek';

	execute() {

		return { status: 'FINISHED', result: this.context.value };

	}

}

function session() {

	const changes = [];
	const context = {
		value: 0,
		signals: { historyChanged: { dispatch: ( op ) => changes.push( op ) } },
	};
	context.ops = new Ops( context ).register( Increment ).register( Peek );
	return { context, changes };

}

test( 'undoable operators record, undo and redo in order', () => {

	const { context, changes } = session();
	assert.deepEqual( context.ops.execute( 'test.increment', 2 ), { status: 'FINISHED', result: 2 } );
	new Increment( context, 3 ).run();
	assert.equal( context.value, 5 );

	context.ops.undo();
	assert.equal( context.value, 2 );
	context.ops.redo();
	assert.equal( context.value, 5 );
	assert.equal( changes.length, 4 );

	context.ops.undo();
	context.ops.execute( 'test.increment', 10 );
	assert.equal( context.ops.redos.length, 0 );

} );

test( 'non-undoable, failed poll and cancelled operators stay out of history', () => {

	const { context } = session();
	assert.deepEqual( context.ops.execute( 'test.peek' ), { status: 'FINISHED', result: 0 } );
	assert.equal( context.ops.execute( 'test.increment', 0 ).status, 'CANCELLED' );
	assert.equal( context.ops.execute( 'test.increment', - 1 ).status, 'CANCELLED' );
	assert.equal( context.ops.undos.length, 0 );
	assert.equal( context.ops.undo(), undefined );

} );

test( 'the undo stack drops its oldest entry past the limit', () => {

	const { context } = session();
	context.ops.limit = 3;
	for ( let by = 1; by <= 5; by ++ ) context.ops.execute( 'test.increment', by );
	assert.deepEqual( context.ops.undos.map( ( op ) => op.by ), [ 3, 4, 5 ] );

} );

test( 'clear empties both stacks and reports the change', () => {

	const { context, changes } = session();
	context.ops.execute( 'test.increment', 1 );
	context.ops.execute( 'test.increment', 2 );
	context.ops.undo();
	context.ops.clear();
	assert.equal( context.ops.undos.length, 0 );
	assert.equal( context.ops.redos.length, 0 );
	assert.equal( changes.at( - 1 ), undefined );

} );

test( 'an operator that throws during undo stays on the undo stack', () => {

	const { context } = session();
	const op = new Increment( context );
	op.run();
	op.undo = () => {

		throw new Error( 'boom' );

	};
	assert.throws( () => context.ops.undo() );
	assert.deepEqual( context.ops.undos, [ op ] );
	assert.equal( context.ops.redos.length, 0 );

} );
