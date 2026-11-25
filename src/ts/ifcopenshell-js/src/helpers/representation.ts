// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.representation functions that use numpy in Python, written by hand with TypedArrays.
// A matrix is a 4x4 Float64Array in row-major order (see helpers/placement.ts).
// The generated util/representation re-exports them (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import { getMappeditemTransformation, multiply, type Matrix4 } from './placement.js';
import { getRepresentation, resolveRepresentation } from '../util/representation.js';
import { getBaseExtrusions } from '../util/shape.js';

/** An item of a representation and the matrix that places it, as ResolvedItemDict. */
export interface ResolvedItem {
  matrix: Matrix4;
  item: EntityInstance;
}

function identity(): Matrix4 {
  return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/** numpy.allclose with its default tolerances. */
function allclose(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - b[i]!) > 1e-8 + 1e-5 * Math.abs(b[i]!)) return false;
  }
  return true;
}

/** The items of a representation, with mapped items replaced by the items they map and their matrices. */
export function resolveItems(representation: EntityInstance, options: { matrix?: Matrix4 | null } = {}): ResolvedItem[] {
  const matrix = options.matrix ?? identity();
  const results: ResolvedItem[] = [];
  for (const item of (representation.get('Items') as EntityInstance[] | null) ?? []) {
    if (item.isA('IfcMappedItem')) {
      let repMatrix = getMappeditemTransformation(item);
      if (!allclose(repMatrix, identity())) repMatrix = multiply(repMatrix, matrix);
      const source = item.get('MappingSource') as EntityInstance;
      results.push(...resolveItems(source.get('MappedRepresentation') as EntityInstance, { matrix: repMatrix }));
    } else {
      results.push({ matrix: Float64Array.from(matrix), item });
    }
  }
  return results;
}

/**
 * The two points of a wall's reference axis, in the +X direction: from its axis representation, else
 * the X extent of its base extrusion profiles, else from the origin along +X for `fallbackLength`.
 */
export function getReferenceLine(wall: EntityInstance, options: { fallbackLength?: number } = {}): Float64Array[] {
  const axis = getRepresentation(wall, 'Plan', { subcontext: 'Axis', targetView: 'GRAPH_VIEW' }) as EntityInstance | null;
  if (axis) {
    for (const item of resolveRepresentation(axis).get('Items') as EntityInstance[]) {
      let points: ArrayLike<number>[];
      if (item.isA('IfcPolyline')) points = (item.get('Points') as EntityInstance[]).map(p => p.get(0) as number[]);
      else if (item.isA('IfcIndexedPolyCurve')) points = (item.get('Points') as EntityInstance).get('CoordList') as number[][];
      else continue;
      // An axis always goes in the +X direction.
      if (points[0]![0]! < points[1]![0]!) return [Float64Array.from(points[0]!), Float64Array.from(points[1]!)];
      return [Float64Array.from(points[1]!), Float64Array.from(points[0]!)];
    }
  } else {
    const extrusions = getBaseExtrusions(wall) as EntityInstance[] | null;
    for (const extrusion of extrusions ?? []) {
      const profile = extrusion.get('SweptArea') as EntityInstance;
      const curve = profile.attributes().includes('OuterCurve') ? (profile.get('OuterCurve') as EntityInstance | null) : null;
      let x: number[];
      if (!curve) continue;
      else if (curve.isA('IfcPolyline')) x = (curve.get('Points') as EntityInstance[]).map(p => (p.get(0) as number[])[0]!);
      else if (curve.isA('IfcIndexedPolyCurve')) x = ((curve.get('Points') as EntityInstance).get('CoordList') as number[][]).map(p => p[0]!);
      else continue;
      return [new Float64Array([Math.min(...x), 0]), new Float64Array([Math.max(...x), 0])];
    }
  }
  return [new Float64Array([0, 0]), new Float64Array([options.fallbackLength ?? 1.0, 0])];
}
