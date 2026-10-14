import { Scene } from '../../tool/index.js';
import { Operator } from '../../ops/Operator.js';

class ShowSelectionOperator extends Operator {

	static operatorName = 'show.selection';
	static operatorLabel = 'Show Selection';
	static undoable = true;

	constructor( context, ids ) {

		super( context );
		this.ids = Array.isArray( ids ) ? [ ...ids ] : [];

	}

	execute() {

		if ( this.ids.length === 0 ) {

			this.ids = [ ...Scene.getSelection() ];

		}

		if ( this.ids.length === 0 ) {

			console.warn( 'ShowSelectionOperator: No ids provided' );
			return { status: 'CANCELLED' };

		}

		Scene.show( this.ids );

	}

	undo() {

		Scene.hide( this.ids );

	}

}

export { ShowSelectionOperator };
