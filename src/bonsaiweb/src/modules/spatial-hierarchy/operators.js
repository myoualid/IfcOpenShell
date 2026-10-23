import { Operator } from '../../ops.js';
import { Viewer } from '../../tool/Viewer.js';

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

		const viewer = Viewer.get();
		if ( this.mode === 'add' ) viewer.addToSelection( this.ids );
		else if ( this.mode === 'remove' ) viewer.removeFromSelection( this.ids );
		else viewer.setSelection( this.ids );
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

		Viewer.get().setSelection( this.ids );
		Viewer.get().isolateSelected();
		this.context.signals.visibilityChanged.dispatch( { action: 'isolate', target: this.ids } );
		return { status: 'FINISHED' };

	}

}

class SpatialHidden extends Operator {

	static operatorName = 'spatial.hidden';
	static operatorLabel = 'Hidden Objects';

	poll() {

		return Boolean( Viewer.get() );

	}

	execute() {

		let hidden = [];
		try {

			hidden = Viewer.get().getHidden();

		} catch { /* element table is not ready until the first model is drawn */ }

		return { status: 'FINISHED', result: new Set( hidden ) };

	}

}

class SpatialObjects extends Operator {

	static operatorName = 'spatial.objects';
	static operatorLabel = 'Spatial Objects';

	poll() {

		return Boolean( Viewer.get() );

	}

	async execute() {

		const objects = await Viewer.get().getObjects().catch( () => [] );
		return { status: 'FINISHED', result: objects };

	}

}

export { SpatialHidden, SpatialIsolate, SpatialObjects, SpatialSelect };
export default [ SpatialSelect, SpatialIsolate, SpatialObjects, SpatialHidden ];
