
/**
 * Geometry APIs matching Python `ifcopenshell.geom`.
 *
 * @module Geometry
 */

import '../disposable.js';

import * as serializers from '../serializers/index.js';
import { iterate, iterator } from './iterator.js';
import {
  columnMajorToRowMajor4,
  rowMajorToColumnMajor4,
  transformPoint4,
} from './matrix.js';
import { settings } from './settings.js';

export { settings } from './settings.js';
export { iterator, iterate } from './iterator.js';
export { columnMajorToRowMajor4, rowMajorToColumnMajor4, transformPoint4 } from './matrix.js';
export type {
  CollectOptions,
  CollectResult,
  IteratorFilter,
  IteratorMetadata,
  IteratorOptions,
  OperationProgress,
} from './iterator.js';
export type { Mesh, MeshFloatArray, MeshPrecision } from './mesh.js';
export type { MatrixPoint3 } from './matrix.js';
export type { SettingInput } from './settings.js';
export { serializers };

/** Namespace object matching `import ifcopenshell.geom`. */
export const geom = {
  settings,
  iterator,
  iterate,
  serializers,
  columnMajorToRowMajor4,
  rowMajorToColumnMajor4,
  transformPoint4,
};
