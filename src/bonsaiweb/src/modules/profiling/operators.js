import { Operator } from '../../ops.js';

class ProfilerToggle extends Operator {

	static operatorName = 'profiler.toggle';
	static operatorLabel = 'Toggle Profiler';

	poll() {

		return Boolean( this.context.profiling?.profilerPanel );

	}

	execute() {

		this.context.profiling.profilerPanel.toggle();
		return { status: 'FINISHED' };

	}

}

export default [ ProfilerToggle ];
