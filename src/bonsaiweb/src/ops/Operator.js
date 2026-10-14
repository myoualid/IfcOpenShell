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

	run() {

		return this.context.ops.run( this );

	}

}

export { Operator };
