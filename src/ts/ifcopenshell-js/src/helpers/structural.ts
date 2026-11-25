// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.structural functions that use numpy in Python, written by hand with TypedArrays.
// The generated util/structural re-exports them (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import { getPlacement } from './placement.js';
import { getActivityItem, getActivityLoadCases, getAnalysisModels } from '../util/structural.js';

/**
 * The axes that an activity's loads in global coordinates are given in: a 3x3 rotation matrix in
 * row-major order (m[row * 3 + column]) whose columns are the X, Y and Z axes, in project coordinates.
 */
export function getGlobalAxes(activity: EntityInstance): Float64Array {
  const item = getActivityItem(activity) as EntityInstance | null;
  const models: EntityInstance[] = item ? [...(getAnalysisModels(item) as EntityInstance[])] : [];
  for (const loadCase of getActivityLoadCases(activity) as EntityInstance[]) models.push(...(getAnalysisModels(loadCase) as EntityInstance[]));
  const placements = models.map(m => m.get('SharedPlacement') as EntityInstance | null).filter(p => p);
  placements.push(activity.get('ObjectPlacement') as EntityInstance | null);
  for (const placement of placements) {
    if (placement) {
      const m = getPlacement({ placement });
      return new Float64Array([m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!]);
    }
  }
  return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
}
