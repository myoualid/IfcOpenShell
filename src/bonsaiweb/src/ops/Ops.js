const CANCELLED = Object.freeze( { status: 'CANCELLED' } );

class Ops {

	constructor( context, { limit = 50 } = {} ) {

		this.context = context;
		this.limit = limit;
		this.registry = new Map();
		this.undos = [];
		this.redos = [];

	}

	register( OperatorClass ) {

		this.registry.set( OperatorClass.operatorName, OperatorClass );
		return this;

	}

	execute( name, ...args ) {

		const OperatorClass = this.registry.get( name );
		if ( ! OperatorClass ) throw new Error( `ops: unknown operator "${ name }"` );
		return new OperatorClass( this.context, ...args ).run();

	}

	// An async execute is recorded when it starts, so undo order follows call order.
	run( op ) {

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

		this.context.signals.historyChanged.dispatch( op );

	}

}

export { Ops };
