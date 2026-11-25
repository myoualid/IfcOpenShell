// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.geometry.connect_wall and create_2pt_wall, which use numpy in Python, written by hand with
// TypedArrays. Matrices are 4x4 Float64Arrays in row-major order (see helpers/placement.ts).
// The generated API modules re-export them (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import type { File } from '../file.js';
import { addWallRepresentation } from '../api/geometry/add_wall_representation.js';
import { connectPath } from '../api/geometry/connect_path.js';
import { intersectXAxis2d } from '../util/shape_builder.js';
import { calculateUnitScale } from '../util/unit.js';
import { editObjectPlacement } from './object_placement.js';
import { getPlacement, invert, multiply, type Matrix4 } from './placement.js';
import { getReferenceLine } from './representation.js';

/** The XY of a matrix applied to the 2D point (x, y, 0, 1). */
function apply2d(m: Matrix4, point: ArrayLike<number>): Float64Array {
  const [x, y] = [point[0]!, point[1]!];
  return new Float64Array([m[0]! * x + m[1]! * y + m[3]!, m[4]! * x + m[5]! * y + m[7]!]);
}

/**
 * Connects the path of wall2 to wall1, at the end of wall1 nearest to where the axis of wall2 meets
 * it. Returns the IfcRelConnectsPathElements, or null when the axes are parallel.
 */
export function connectWall(
  file: File,
  wall1: EntityInstance,
  wall2: EntityInstance,
  options: { isAtpath?: boolean } = {},
): EntityInstance | null {
  const matrix1i = invert(getPlacement({ placement: wall1.get('ObjectPlacement') as EntityInstance | null }));
  const matrix2 = getPlacement({ placement: wall2.get('ObjectPlacement') as EntityInstance | null });
  const axis1 = getReferenceLine(wall1);
  const toWall1 = multiply(matrix1i, matrix2);
  const axis2 = getReferenceLine(wall2).map(point => apply2d(toWall1, point));
  const midx = (axis1[0]![0]! + axis1[1]![0]!) / 2;
  const starty = axis2[0]![1]!;
  const endy = axis2[1]![1]!;
  const y = axis1[0]![1]!;

  const x = intersectXAxis2d(axis2[0]!, axis2[1]!, { y }) as number | null;
  if (x === null || x === undefined) return null;

  const wall1End = x > midx ? 'ATEND' : 'ATSTART';
  let wall2End: string;
  if (options.isAtpath) wall2End = 'ATPATH';
  else if (Math.abs(y - starty) < Math.abs(y - endy)) wall2End = 'ATSTART';
  else wall2End = 'ATEND';

  return connectPath(file, wall1, wall2, { relatingConnection: wall1End, relatedConnection: wall2End });
}

/**
 * Creates the body of a wall from p1 to p2, and places the wall at p1 along that direction.
 * Returns the IfcShapeRepresentation.
 */
export function create2ptWall(
  file: File,
  element: EntityInstance,
  context: EntityInstance,
  p1: ArrayLike<number>,
  p2: ArrayLike<number>,
  elevation: number,
  height: number,
  thickness: number,
  options: { isSi?: boolean } = {},
): EntityInstance {
  const siConversion = calculateUnitScale(file);
  let start = [p1[0]!, p1[1]!];
  const end = [p2[0]!, p2[1]!];
  let length = Math.hypot(end[0]! - start[0]!, end[1]! - start[1]!);
  if (!(options.isSi ?? true)) {
    length *= siConversion;
    height *= siConversion;
    thickness *= siConversion;
    // p2 is not converted, as the length is already calculated.
    start = start.map(v => v * siConversion);
    elevation *= siConversion;
  }
  const representation = addWallRepresentation(file, context, { length, height, thickness }) as EntityInstance;
  const vx = end[0]! - start[0]!;
  const vy = end[1]! - start[1]!;
  const norm = Math.hypot(vx, vy);
  const [cx, cy] = [vx / norm, vy / norm];
  const matrix = new Float64Array([cx, -cy, 0, start[0]!, cy, cx, 0, start[1]!, 0, 0, 1, elevation, 0, 0, 0, 1]);
  editObjectPlacement(file, element, { matrix });
  return representation;
}
