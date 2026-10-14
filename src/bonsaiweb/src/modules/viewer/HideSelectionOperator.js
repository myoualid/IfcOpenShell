import { Scene } from '../../tool/index.js';
import { Operator } from '../../ops/Operator.js';

class HideSelectionOperator extends Operator {

	static operatorName = 'hide.selection';
	static operatorLabel = 'Hide Selection';
	static undoable = true;

	constructor( context, ids ) {

		super( context );
		this.ids = Array.isArray( ids ) ? [ ...ids ] : [];

	}

	execute() {

		// Capture selection on first run; subsequent redo reuses the same ids.
		if ( this.ids.length === 0 ) {

			this.ids = [ ...Scene.getSelection() ];

		}

		Scene.hide( this.ids );

	}

	undo() {

		Scene.show( this.ids );

	}

}

export { HideSelectionOperator };
