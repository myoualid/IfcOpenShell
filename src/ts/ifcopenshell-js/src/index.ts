
/**
 * Core `ifcopenshell` API — same operations as SWIG Python, JS camelCase.
 *
 * @module Core
 */

import './disposable.js';

import { Entity } from './entity.js';
import { IfcFile } from './file.js';
import { geom } from './geom/index.js';
import { guid } from './guid.js';
import * as ifcview from './ifcview/index.js';
import {
  abortError,
  file,
  IfcOpenShellError,
  IfcOpenShellErrorCode,
  IfcOpenShellErrorKind,
  init,
  isIfcOpenShellAbortError,
  open,
} from './session.js';

export {
  abortError,
  file,
  IfcOpenShellError,
  IfcOpenShellErrorCode,
  IfcOpenShellErrorKind,
  init,
  isIfcOpenShellAbortError,
  open,
};
export type { IfcOpenShell } from './session.js';
export { IfcFile };
export type { HeaderInfo, OpenOptions } from './file.js';
export { Entity };
export type { AttributeInput, EntityInfo, EntityInfoValue } from './entity.js';
export { guid };
export { geom };
export {
  settings,
  iterator,
  iterate,
  serializers,
  columnMajorToRowMajor4,
  rowMajorToColumnMajor4,
  transformPoint4,
} from './geom/index.js';
export type {
  CollectOptions,
  CollectResult,
  IteratorFilter,
  IteratorMetadata,
  IteratorOptions,
  Mesh,
  MeshFloatArray,
  MeshPrecision,
  MatrixPoint3,
  OperationProgress,
  SettingInput,
} from './geom/index.js';
export { obj, svg, ttl } from './serializers/index.js';
export type {
  ExportOptions,
  ExportResult,
  SerializerFormat,
} from './serializers/index.js';
export type {
  EmscriptenFS,
  EmscriptenOption,
  EmscriptenOptions,
  EmscriptenModuleFactory,
  IfcOpenshellApiFactory,
  IfcOpenshellModule,
  InitOptions,
  PluginEntry,
  PluginKind,
  PluginLoader,
  PluginManifest,
  Ptr,
  WasmAssets,
} from './types.js';
/** Viewer helpers — not part of the Python SWIG parity surface. */
export * as util from './util/index.js';
/** IFC → `.ifcview` sidecar conversion / parser — not part of the Python SWIG parity surface. */
export { ifcview };

const ifcopenshell = { init, open, file, guid, geom, ifcview, IfcFile, Entity };
export default ifcopenshell;
export { AttributeValue } from './attribute.js';
export type { IfcLogical, IfcValue, NestedEntityIds } from './attribute.js';
