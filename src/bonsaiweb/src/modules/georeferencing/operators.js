import { Operator } from '../../ops.js';

class GeoreferencingToggle extends Operator {

	static operatorName = 'Georeferencing.Toggle';
	static operatorLabel = 'Toggle Survey Point';

	poll() {

		return Boolean( this.context.georeferencing?.panel );

	}

	execute() {

		this.context.georeferencing.panel.toggle();
		return { status: 'FINISHED' };

	}

}

export default [ GeoreferencingToggle ];
