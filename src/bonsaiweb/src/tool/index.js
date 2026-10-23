// bonsai.tool — classmethod-style namespace. Each export is a class
// whose public API is a set of static methods over module-level state.
// Call sites look like `tool.Ifc.get()`, `tool.Ifc.entity()`, and
// `tool.Ifc.globalId()`, mirroring `bonsai.tool.Ifc` in Python.
// The live IfcViewer is `bonsai.viewer`.

import { Ifc } from './Ifc.js';
import { Federation } from './federation.js';
import { Loader } from './Loader.js';
import { Element } from './Element.js';
import { Pset } from './Pset.js';
import { Terminal } from './Terminal.js';
import { Viewer } from './Viewer.js';

export { Ifc, Loader, Federation, Element, Pset, Terminal, Viewer };
export default { Ifc, Loader, Element, Pset, Terminal };
