import { Loader } from '../../tool/index.js';
import { Operator } from '../../ops/Operator.js';

class LoadIfc extends Operator {

	static operatorName = 'load.ifc';
	static operatorLabel = 'Load IFC';

	// `options` overrides configuration.geometry for this load:
	// { engine, kernel, thread }.
	constructor( context, urlOrFile, options = {} ) {

		super( context );
		this.file = ( typeof File !== 'undefined' && urlOrFile instanceof File ) ? urlOrFile : null;
		this.url = this.file ? '' : ( urlOrFile ?? '' );
		this.options = options;

	}

	poll() {

		return Boolean( this.file || this.url );

	}

	// Async; callers that need completion listen to signals.modelLoaded.
	// Not undoable: the viewer cannot drop one model without clearing all.
	execute() {

		const name = this.file?.name || this.url;
		this.context.signals.modelLoadStarted.dispatch( {
			source: this.file ? 'file' : 'url',
			name,
		} );

		const hooks = {
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
		};

		const pending = this.file
			? Loader.loadLocalFile( this.file, hooks )
			: Loader.loadIfcUrl( this.url, hooks );

		return pending.catch( ( err ) => {

			console.error( err );

		} );

	}

}

export default LoadIfc;
