import { fromRoot } from '../../root.js';
import { Loader } from '../../tool/index.js';
import { Operator } from '../../ops/Operator.js';

class LoadSampleIfc extends Operator {

	static operatorName = 'load.sample.ifc';
	static operatorLabel = 'Load Sample IFC';

	// `options` overrides configuration.geometry for this load:
	// { engine, kernel, thread }.
	constructor( context, options = {} ) {

		super( context );
		this.options = options;

	}

	async execute() {

		const url = fromRoot( 'app/files/ifc/window_wall.ifc' ).href;
		this.context.signals.modelLoadStarted.dispatch( { source: 'url', name: url } );
		return Loader.loadIfcUrl( url, {
			...this.options,
			onConvertProgress: ( progress ) => {

				this.context.signals.modelLoadStarted.dispatch( { source: 'convert', ...progress } );

			},
			onLiveIfc: ( payload ) => {

				this.context.signals.liveIfcReady.dispatch( payload );
				if ( this.context.store.selection ) {

					this.context.signals.objectPicked.dispatch( this.context.store.selection );

				}

			},
		} );

	}

}

export default LoadSampleIfc;
