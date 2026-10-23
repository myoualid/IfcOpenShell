// This file was generated with the assistance of an AI coding tool.

// bonsai.tool.Scene — scene-wide changes. Each one applies to the viewer
// and records the value where store.scene and the project file read it.

import { sceneRecord } from '../context/store.js';
import { Federation } from './federation.js';
import { Viewer } from './Viewer.js';

export class Scene {

	static setBackground( color ) {

		Viewer.get().setBackground( color );
		sceneRecord.background = color;

	}

	static setUnit( unit ) {

		Viewer.get().setFederationUnit( unit );
		Federation.setUnit( unit );

	}

	static setFalseOrigin( origin ) {

		Viewer.get().setFalseOrigin( origin );
		Federation.setOrigin( origin );

	}

	// A null transform clears it.
	static setModelTransform( sourceId, transform ) {

		if ( transform ) Viewer.get().setModelTransform( sourceId, transform );
		else Viewer.get().clearModelTransform( sourceId );
		Federation.setTransform( sourceId, transform );

	}

}
