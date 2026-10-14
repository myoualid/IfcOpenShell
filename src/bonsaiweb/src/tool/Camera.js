// Camera — orbit camera state and canned views.

import { viewer } from '../viewer/host.js';

export class Camera {

	static VIEWS = Object.freeze( {
		FRONT: 0, BACK: 1, LEFT: 2, RIGHT: 3, TOP: 4, BOTTOM: 5,
	} );

	static get() {

		return viewer.getCamera();

	}

	static set( c ) {

		viewer.setCamera( c );

	}

	static standardView( id ) {

		viewer.setStandardView( id );

	}

	static viewAll() {

		viewer.viewAll();

	}

	static frameSelection() {

		viewer.frameSelection();

	}

}

export default Camera;
