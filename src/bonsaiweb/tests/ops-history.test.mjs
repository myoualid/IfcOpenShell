import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Signals } from '../src/context/signals.js';
import { Operator, Ops } from '../src/ops.js';

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
	const onChange = ( op ) => changes.push( op );
	Signals.historyChanged.add( onChange );

	const context = { value: 0 };
	const ops = new Ops().register( Increment ).register( Peek );
	return {
		context,
		ops,
		changes,
		dispose() {

			Signals.historyChanged.remove( onChange );

		},
	};

}

test( 'undoable operators record, undo and redo in order', () => {

	const { context, ops, changes, dispose } = session();
	try {

		assert.deepEqual( ops.execute( 'test.increment', context, 2 ), { status: 'FINISHED', result: 2 } );
		ops.execute( 'test.increment', context, 3 );
		assert.equal( context.value, 5 );

		ops.undo();
		assert.equal( context.value, 2 );
		ops.redo();
		assert.equal( context.value, 5 );
		assert.equal( changes.length, 4 );

		ops.undo();
		ops.execute( 'test.increment', context, 10 );
		assert.equal( ops.redos.length, 0 );

	} finally {

		dispose();

	}

} );

test( 'non-undoable, failed poll and cancelled operators stay out of history', () => {

	const { context, ops, dispose } = session();
	try {

		assert.deepEqual( ops.execute( 'test.peek', context ), { status: 'FINISHED', result: 0 } );
		assert.equal( ops.execute( 'test.increment', context, 0 ).status, 'CANCELLED' );
		assert.equal( ops.execute( 'test.increment', context, - 1 ).status, 'CANCELLED' );
		assert.equal( ops.undos.length, 0 );
		assert.equal( ops.undo(), undefined );

	} finally {

		dispose();

	}

} );

test( 'the undo stack drops its oldest entry past the limit', () => {

	const { context, ops, dispose } = session();
	try {

		ops.limit = 3;
		for ( let by = 1; by <= 5; by ++ ) ops.execute( 'test.increment', context, by );
		assert.deepEqual( ops.undos.map( ( op ) => op.by ), [ 3, 4, 5 ] );

	} finally {

		dispose();

	}

} );

test( 'clear empties both stacks and reports the change', () => {

	const { context, ops, changes, dispose } = session();
	try {

		ops.execute( 'test.increment', context, 1 );
		ops.execute( 'test.increment', context, 2 );
		ops.undo();
		ops.clear();
		assert.equal( ops.undos.length, 0 );
		assert.equal( ops.redos.length, 0 );
		assert.equal( changes.at( - 1 ), undefined );

	} finally {

		dispose();

	}

} );

test( 'an operator that throws during undo stays on the undo stack', () => {

	const { context, ops, dispose } = session();
	try {

		ops.execute( 'test.increment', context );
		const op = ops.undos[ 0 ];
		op.undo = () => {

			throw new Error( 'boom' );

		};
		assert.throws( () => ops.undo() );
		assert.deepEqual( ops.undos, [ op ] );
		assert.equal( ops.redos.length, 0 );

	} finally {

		dispose();

	}

} );
