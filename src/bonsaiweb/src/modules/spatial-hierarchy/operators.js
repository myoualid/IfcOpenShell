import { Operator } from '../../ops/Operator.js';
import { HideSelectionOperator } from '../viewer/HideSelectionOperator.js';
import { ShowSelectionOperator } from '../viewer/ShowOperator.js';
import { Scene } from '../../tool/index.js';

class SpatialSelect extends Operator {

	static operatorName = 'spatial.select';
	static operatorLabel = 'Select in Hierarchy';

	constructor( context, ids, mode ) {

		super( context );
		this.ids = ids ?? [];
		this.mode = mode ?? 'replace';

	}

	poll() {

		return this.ids.length > 0;

	}

	execute() {

		if ( this.mode === 'add' ) Scene.addToSelection( this.ids );
		else if ( this.mode === 'remove' ) Scene.removeFromSelection( this.ids );
		else Scene.setSelection( this.ids );
		return { status: 'FINISHED' };

	}

}

class SpatialIsolate extends Operator {

	static operatorName = 'spatial.isolate';
	static operatorLabel = 'Isolate in Hierarchy';

	constructor( context, ids ) {

		super( context );
		this.ids = ids ?? [];

	}

	poll() {

		return this.ids.length > 0;

	}

	execute() {

		Scene.setSelection( this.ids );
		Scene.isolateSelected();
		return { status: 'FINISHED' };

	}

}

class SpatialObjects extends Operator {

	static operatorName = 'spatial.objects';
	static operatorLabel = 'Spatial Objects';

	async execute() {

		const objects = await Scene.getObjects().catch( () => [] );
		return { status: 'FINISHED', result: objects };

	}

}

export {
	HideSelectionOperator,
	ShowSelectionOperator,
	SpatialIsolate,
	SpatialObjects,
	SpatialSelect,
};
export default [ SpatialSelect, SpatialIsolate, SpatialObjects ];
