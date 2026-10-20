import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	clearSection,
	readViewerTools,
	toggleFly,
	toggleProjection,
	toggleSection,
} from '../src/tool/viewerTools.js';

test( 'section uses the JS API when the build has it', () => {

	let active = false;
	const api = {
		toggleSection() { active = ! active; return active; },
		sectionActive() { return active; },
		clearSection() { active = false; },
	};
	assert.equal( toggleSection( api ), true );
	assert.equal( readViewerTools( api ).section, true );
	clearSection( api );
	assert.equal( readViewerTools( api ).section, false );

} );

test( 'section falls back to the wasm exports the embedded page calls', () => {

	let active = 0;
	const api = {
		module: {
			_toggle_section_c() { active = active ? 0 : 1; },
			_section_is_active_c() { return active; },
			_clear_section_c() {},
		},
	};
	assert.equal( toggleSection( api ), true );
	assert.equal( readViewerTools( api ).section, true );

} );

test( 'fly and ortho read the embedded viewer flags', () => {

	const flags = { fly: 0, ortho: 0 };
	const api = {
		module: {
			_toggle_fly_c() { flags.fly = flags.fly ? 0 : 1; },
			_fly_is_active_c() { return flags.fly; },
			_toggle_projection_c() { flags.ortho = flags.ortho ? 0 : 1; },
			_projection_is_ortho_c() { return flags.ortho; },
		},
	};
	assert.equal( toggleFly( api ), true );
	assert.equal( toggleProjection( api ), true );
	assert.deepEqual(
		{ fly: readViewerTools( api ).fly, ortho: readViewerTools( api ).ortho },
		{ fly: true, ortho: true },
	);

} );

test( 'ortho uses setCamera when the toggle export is missing', () => {

	const camera = { ortho: false };
	const api = {
		getCamera() { return camera; },
		setCamera( next ) { camera.ortho = next.ortho; },
	};
	assert.equal( toggleProjection( api ), true );
	assert.equal( camera.ortho, true );

} );
