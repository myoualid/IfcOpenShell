import { Operator } from '../../ops.js';
import { Loader } from '../../tool/index.js';

const GEOMETRY_KEYS = [ 'kernel', 'thread', 'delivery' ];

class SettingsToggle extends Operator {

	static operatorName = 'Settings.Toggle';
	static operatorLabel = 'Toggle Settings';

	poll() {

		return Boolean( this.context.settings?.panel );

	}

	execute() {

		this.context.settings.panel.toggle();
		return { status: 'FINISHED' };

	}

}

class SettingsSetGeometry extends Operator {

	static operatorName = 'Settings.SetGeometry';
	static operatorLabel = 'Set Geometry';

	constructor( context, options = {} ) {

		super( context );
		this.options = options;

	}

	execute() {

		const next = Loader.convertOptions();
		for ( const key of GEOMETRY_KEYS ) {

			if ( this.options?.[ key ] != null ) next[ key ] = this.options[ key ];

		}

		const applied = Loader.configure( next );
		if ( this.context.geometry ) Object.assign( this.context.geometry, applied );
		this.context.signals.geometryChanged.dispatch( applied );
		return { status: 'FINISHED' };

	}

}

export default [ SettingsToggle, SettingsSetGeometry ];
