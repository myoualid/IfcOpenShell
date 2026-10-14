import terminal from './code.terminal/ui.js';
import project from './project/ui.js';
import properties from './properties/ui.js';
import spatial from './spatial-hierarchy/ui.js';

/** Panel classes. The GUI host mounts these; headless does not import this file. */
export const modulePanels = [ ...project, ...spatial, ...properties, ...terminal ];
