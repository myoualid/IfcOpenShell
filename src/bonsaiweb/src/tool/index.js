// bonsai.tool — classmethod-style namespace. Each export is a class
// whose public API is a set of static methods over module-level state.
// Call sites look like `tool.Ifc.get()`, `tool.Ifc.entity()`, and
// `tool.Viewer.get()`, mirroring `bonsai.tool.Ifc` in Python.

import { Ifc } from './Ifc.js';
import { Federation } from './federation.js';
import { Loader } from './Loader.js';
import { Cost } from './Cost.js';
import { Element } from './Element.js';
import { Pset } from './Pset.js';
import { Scene } from './Scene.js';
import { Sequence } from './Sequence.js';
import { Terminal } from './Terminal.js';
import { Viewer } from './Viewer.js';

export { Ifc, Loader, Federation, Cost, Element, Pset, Scene, Sequence, Terminal, Viewer };
export default { Ifc, Loader, Federation, Cost, Element, Pset, Scene, Sequence, Terminal, Viewer };
