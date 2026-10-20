import { Signals } from './context/signals.js';

const CANCELLED = Object.freeze( { status: 'CANCELLED' } );

class Operator {

	static operatorName = '';
	static operatorLabel = '';
	static undoable = false;

	constructor( context ) {

		this.context = context;

	}

	poll() {

		return true;

	}

	execute() {}

	undo() {}

}

class Ops {

	constructor( { limit = 50 } = {} ) {

		this.limit = limit;
		this.registry = new Map();
		this.undos = [];
		this.redos = [];

	}

	register( OperatorClass ) {

		this.registry.set( OperatorClass.operatorName, OperatorClass );
		return this;

	}

	// An async execute is recorded when it starts, so undo order follows call order.
	execute( name, context, ...args ) {

		const OperatorClass = this.registry.get( name );
		if ( ! OperatorClass ) throw new Error( `ops: unknown operator "${ name }"` );

		const op = new OperatorClass( context, ...args );
		if ( ! op.poll() ) return CANCELLED;

		const result = op.execute();
		if ( op.constructor.undoable && result?.status !== 'CANCELLED' ) {

			this.undos.push( op );
			if ( this.undos.length > this.limit ) this.undos.shift();
			this.redos.length = 0;
			this._changed( op );

		}

		return result;

	}

	undo() {

		const op = this.undos.at( - 1 );
		if ( ! op ) return;
		op.undo();
		this.redos.push( this.undos.pop() );
		this._changed( op );
		return op;

	}

	redo() {

		const op = this.redos.at( - 1 );
		if ( ! op ) return;
		op.execute();
		this.undos.push( this.redos.pop() );
		this._changed( op );
		return op;

	}

	clear() {

		this.undos.length = 0;
		this.redos.length = 0;
		this._changed();

	}

	_changed( op ) {

		Signals.historyChanged.dispatch( op );

	}

}

const ops = new Ops();

// Ctrl+Z / Ctrl+Y, skipped while focus is in a text field.
function bindKeyboard() {

	document.addEventListener( 'keydown', ( e ) => {

		const tag = document.activeElement?.tagName;
		if ( tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable ) return;

		if ( e.ctrlKey && ! e.shiftKey && e.key === 'z' ) {

			e.preventDefault();
			ops.undo();

		} else if ( e.ctrlKey && e.key === 'y' ) {

			e.preventDefault();
			ops.redo();

		}

	} );

}

export default ops;
export { Operator, Ops, ops, bindKeyboard };
