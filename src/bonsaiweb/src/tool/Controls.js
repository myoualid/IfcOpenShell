// Controls — mouse / navigation input mapping.

import { viewer } from '../viewer/host.js';

export class Controls {

	static NAV_PRESETS = Object.freeze( [ 'blender', 'rhino', 'revit', 'web' ] );

	static setNavPreset( name ) {

		viewer.setNavPreset( name );

	}

}

export default Controls;
