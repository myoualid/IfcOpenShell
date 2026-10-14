import { Scene } from '../../tool/index.js';
import { Operator } from '../../ops/Operator.js';

class ShowAllOperator extends Operator {

	static operatorName = 'show.all';
	static operatorLabel = 'Show All';
	static undoable = true;

	constructor( context ) {

		super( context );
		this.ids = [];

	}

	execute() {

		// Capture hidden set on first run so undo can restore it exactly.
		if ( this.ids.length === 0 ) {

			this.ids = [ ...Scene.getHidden() ];

		}

		Scene.showAll();

	}

	undo() {

		Scene.hide( this.ids );

	}

}

export { ShowAllOperator };
