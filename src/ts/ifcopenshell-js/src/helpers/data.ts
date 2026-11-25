// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.data Clipping methods that use numpy in Python, written by hand.
// The generated util/data Clipping class uses them (see `hand_written` in src/transpiler/ts.yaml).

import { EntityInstance } from '../entity_instance.js';
import type { File } from '../file.js';
import type { Clipping } from '../util/data.js';
import { ShapeBuilder } from '../util/shape_builder.js';

/** Row `row`, column `column` of a 4x4 matrix given as 16 row-major numbers or as rows. */
function cell(matrix: ArrayLike<number> | ArrayLike<ArrayLike<number>>, row: number, column: number): number {
  const first = (matrix as ArrayLike<unknown>)[0];
  return typeof first === 'number' ? (matrix as ArrayLike<number>)[row * 4 + column]! : (matrix as ArrayLike<ArrayLike<number>>)[row]![column]!;
}

/**
 * A clipping from an IfcBooleanResult, a Clipping, or an object with `location` and `normal`, or with a
 * `matrix` whose XY plane is the boundary and whose +Z side is removed.
 */
export function ClippingParse(this: typeof Clipping, rawData: EntityInstance | Clipping | Record<string, unknown>): EntityInstance | Clipping {
  if (rawData instanceof EntityInstance) {
    if (!rawData.isA('IfcBooleanResult')) throw new Error(`Provided clipping of unexpected IFC class: ${rawData.isA()}`);
    return rawData;
  }
  if (rawData instanceof this) return rawData;
  if (rawData !== null && typeof rawData === 'object') {
    let data: Record<string, unknown> = rawData;
    if ('matrix' in data) {
      const { matrix, ...rest } = data;
      const m = matrix as ArrayLike<number> | ArrayLike<ArrayLike<number>>;
      data = { ...rest, normal: [0, 1, 2].map(row => cell(m, row, 2)), location: [0, 1, 2].map(row => cell(m, row, 3)) };
    }
    const clipping = this.fromKwargs(data);
    if (clipping.type !== 'IfcBooleanClippingResult') throw new Error(`Provided clipping with unexpected result type "${clipping.type}"`);
    if (clipping.operand_type !== 'IfcHalfSpaceSolid') throw new Error(`Provided clipping with unexpected operand type "${clipping.operand_type}"`);
    return clipping;
  }
  throw new Error(`Unexpected clipping type provided: ${String(rawData)}`);
}

function isClose(a: ArrayLike<number>, b: number[], atol: number): boolean {
  return b.every((target, i) => Math.abs(a[i]! - target) <= atol + 1e-5 * Math.abs(target));
}

/** An IfcBooleanClippingResult that clips the operand with an IfcHalfSpaceSolid at this clipping. */
export function ClippingApply(this: Clipping, ifcFile: File | null, firstOperand: EntityInstance, unitScale: number): EntityInstance {
  const file = ifcFile ?? firstOperand.file()!;
  const builder = new ShapeBuilder(file);
  const normal = this.normal;
  const arbitrary = isClose(normal, [0, 0, 1], 1e-2) || isClose(normal, [0, 0, -1], 1e-2) ? [0, 1, 0] : [0, 0, 1];
  const cross = [
    normal[1] * arbitrary[2]! - normal[2] * arbitrary[1]!,
    normal[2] * arbitrary[0]! - normal[0] * arbitrary[2]!,
    normal[0] * arbitrary[1]! - normal[1] * arbitrary[0]!,
  ];
  const length = Math.hypot(cross[0]!, cross[1]!, cross[2]!);
  const placement = builder.createAxis2Placement3d({
    position: this.location.map(v => v / unitScale),
    zAxis: [...normal],
    xAxis: cross.map(v => v / length),
  });
  const plane = file.create('IfcPlane', [placement]);
  const secondOperand = file.create('IfcHalfSpaceSolid', [plane, false]);
  return file.create('IfcBooleanClippingResult', ['DIFFERENCE', firstOperand, secondOperand]);
}
