// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.geometry.clip_solid_bounded, which uses numpy in Python, written by hand.
// The generated API module re-exports it (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import type { File } from '../file.js';
import { addPset } from '../api/pset/add_pset.js';
import { editPset } from '../api/pset/edit_pset.js';
import { getPset } from '../util/element.js';
import { ShapeBuilder } from '../util/shape_builder.js';
import { calculateUnitScale } from '../util/unit.js';

function isClose(a: ArrayLike<number>, b: number[], atol: number): boolean {
  return b.every((target, i) => Math.abs(a[i]! - target) <= atol + 1e-5 * Math.abs(target));
}

/**
 * Clips a solid with a half-space bounded by a polygon, and returns the IfcBooleanClippingResult. The
 * normal points to the removed material. With an element, the result is added to its BBIM_Boolean
 * property set, so that regenerating a wall keeps it. Python keeps those ids in a set; here they keep
 * the order in which they were added.
 */
export function clipSolidBounded(
  file: File,
  item: EntityInstance,
  location: ArrayLike<number>,
  normal: ArrayLike<number>,
  boundaryPoints: ArrayLike<ArrayLike<number>>,
  options: { boundaryPosition?: ArrayLike<number>; element?: EntityInstance | null } = {},
): EntityInstance {
  const unitScale = calculateUnitScale(file);
  const builder = new ShapeBuilder(file);
  const arbitrary = isClose(normal, [0, 0, 1], 1e-2) || isClose(normal, [0, 0, -1], 1e-2) ? [0, 1, 0] : [0, 0, 1];
  const [nx, ny, nz] = [normal[0]!, normal[1]!, normal[2]!];
  const cross = [ny * arbitrary[2]! - nz * arbitrary[1]!, nz * arbitrary[0]! - nx * arbitrary[2]!, nx * arbitrary[1]! - ny * arbitrary[0]!];
  const length = Math.hypot(cross[0]!, cross[1]!, cross[2]!);
  const xAxis = cross.map(v => v / length);
  const scaledLocation = Array.from(location, v => v / unitScale);
  const planePlacement = builder.createAxis2Placement3d({ position: scaledLocation, zAxis: Array.from(normal), xAxis });
  const plane = file.create('IfcPlane', [planePlacement]);
  const scaledBoundaryPosition = Array.from(options.boundaryPosition ?? [0, 0, 0], v => v / unitScale);
  const boundaryPosition = file.create('IfcAxis2Placement3D', [file.create('IfcCartesianPoint', [scaledBoundaryPosition])]);
  const scaledPoints = Array.from(boundaryPoints, p => [p[0]! / unitScale, p[1]! / unitScale]);
  scaledPoints.push(scaledPoints[0]!); // Close the polygon.
  const boundary = file.create('IfcPolyline', [scaledPoints.map(p => file.create('IfcCartesianPoint', [p]))]);
  const halfSpace = file.create('IfcPolygonalBoundedHalfSpace', [plane, false, boundaryPosition, boundary]);
  const result = file.create('IfcBooleanClippingResult', ['DIFFERENCE', item, halfSpace]);
  const element = options.element ?? null;
  if (element !== null) {
    const psetData = getPset(element, 'BBIM_Boolean') as { id: number; Data: string } | null;
    let pset: EntityInstance;
    let data: number[];
    if (psetData) {
      pset = file.byId(psetData.id);
      data = [...new Set([...(JSON.parse(psetData.Data) as number[]), result.id()])];
    } else {
      pset = addPset(file, element, 'BBIM_Boolean') as EntityInstance;
      data = [result.id()];
    }
    // The same text as json.dumps of a list of ids.
    editPset(file, pset, { properties: { Data: `[${data.join(", ")}]` } });
  }
  return result;
}
