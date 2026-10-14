// bonsai.tool — classmethod-style namespace. Each export is a class
// whose public API is a set of static methods over module-level state.
// Call sites look like `tool.Ifc.get()`, `tool.Ifc.mode(pick)`, and
// `tool.Ifc.globalId()`, mirroring `bonsai.tool.Ifc` in Python.
// The live IfcViewer is available as `bonsai.viewer`.

export { Ifc } from './Ifc.js';
export { Scene } from './Scene.js';
export { Camera } from './Camera.js';
export { Controls } from './Controls.js';
export { Loader } from './Loader.js';
export { Element } from './Element.js';
export { Pset } from './Pset.js';
export { Terminal } from './Terminal.js';

import { Ifc } from './Ifc.js';
import { Scene } from './Scene.js';
import { Camera } from './Camera.js';
import { Controls } from './Controls.js';
import { Loader } from './Loader.js';
import { Element } from './Element.js';
import { Pset } from './Pset.js';
import { Terminal } from './Terminal.js';

export default { Ifc, Scene, Camera, Controls, Loader, Element, Pset, Terminal };
