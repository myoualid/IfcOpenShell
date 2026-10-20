import terminal from './code.terminal/ui.js';
import georeferencing from './georeferencing/ui.js';
import profiling from './profiling/ui.js';
import project from './project/ui.js';
import properties from './properties/ui.js';
import settings from './settings/ui.js';
import spatial from './spatial-hierarchy/ui.js';
import viewer from './viewer/ui.js';

/** Panel classes. The GUI host mounts these; headless does not import this file. */
export const modulePanels = [ ...project, ...settings, ...georeferencing, ...spatial, ...properties, ...viewer, ...profiling, ...terminal ];
