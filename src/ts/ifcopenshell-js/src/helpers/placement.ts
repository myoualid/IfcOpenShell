// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.placement functions that use numpy in Python, written by hand with TypedArrays.
// A matrix is a 4x4 Float64Array in row-major order: m[row * 4 + column], as numpy m[row, column].
// The generated util/placement re-exports them (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import { calculateUnitScale } from '../util/unit.js';

/** A 4x4 transformation matrix, row-major. */
export type Matrix4 = Float64Array;

type Vector3 = [number, number, number];

function identity(): Matrix4 {
  return new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function vector3(values: ArrayLike<number> | null | undefined, fallback: Vector3): Vector3 {
  if (!values) return [...fallback];
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

function normalize(v: Vector3): Vector3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** The product a · b of two 4x4 matrices. */
export function multiply(a: Matrix4, b: Matrix4): Matrix4 {
  const result = new Float64Array(16);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[row * 4 + k]! * b[k * 4 + column]!;
      result[row * 4 + column] = sum;
    }
  }
  return result;
}

/** The inverse of a 4x4 matrix, by Gauss-Jordan elimination with partial pivoting. */
export function invert(m: Matrix4): Matrix4 {
  const a = Float64Array.from(m);
  const result = identity();
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) {
      if (Math.abs(a[row * 4 + column]!) > Math.abs(a[pivot * 4 + column]!)) pivot = row;
    }
    if (a[pivot * 4 + column] === 0) throw new Error('Singular matrix');
    for (let k = 0; k < 4; k++) {
      [a[column * 4 + k], a[pivot * 4 + k]] = [a[pivot * 4 + k]!, a[column * 4 + k]!];
      [result[column * 4 + k], result[pivot * 4 + k]] = [result[pivot * 4 + k]!, result[column * 4 + k]!];
    }
    const scale = a[column * 4 + column]!;
    for (let k = 0; k < 4; k++) {
      a[column * 4 + k] = a[column * 4 + k]! / scale;
      result[column * 4 + k] = result[column * 4 + k]! / scale;
    }
    for (let row = 0; row < 4; row++) {
      const factor = a[row * 4 + column]!;
      if (row === column || factor === 0) continue;
      for (let k = 0; k < 4; k++) {
        a[row * 4 + k] = a[row * 4 + k]! - factor * a[column * 4 + k]!;
        result[row * 4 + k] = result[row * 4 + k]! - factor * result[column * 4 + k]!;
      }
    }
  }
  return result;
}

/**
 * A 4x4 matrix from a location and the Z and X axes. Y is Z × X, and X is projected onto the
 * plane normal to Z, as IfcBuildAxes does.
 */
export function a2p(o: ArrayLike<number>, z: ArrayLike<number>, x: ArrayLike<number>): Matrix4 {
  const zAxis = normalize(vector3(z, [0, 0, 1]));
  const yAxis = normalize(cross(zAxis, normalize(vector3(x, [1, 0, 0]))));
  const xAxis = cross(yAxis, zAxis);
  const origin = vector3(o, [0, 0, 0]);
  const m = identity();
  for (let row = 0; row < 3; row++) {
    m[row * 4] = xAxis[row]!;
    m[row * 4 + 1] = yAxis[row]!;
    m[row * 4 + 2] = zAxis[row]!;
    m[row * 4 + 3] = origin[row]!;
  }
  return m;
}

/** The matrix of an IfcCartesianTransformationOperator, with its scales and mirroring. */
export function _operatorPlacement(inst: EntityInstance, shouldReturnSi: boolean): Matrix4 {
  const origin = vector3((inst.get('LocalOrigin') as EntityInstance).get('Coordinates') as number[], [0, 0, 0]);
  if (shouldReturnSi) {
    const factor = calculateUnitScale(inst.file()!);
    for (let i = 0; i < 3; i++) origin[i] = origin[i]! * factor;
  }
  const ratios = (name: string) => {
    if (!inst.attributes().includes(name)) return null;
    const direction = inst.get(name) as EntityInstance | null;
    return direction ? (direction.get('DirectionRatios') as number[]) : null;
  };
  const axes: Vector3[] = [
    vector3(ratios('Axis1'), [1, 0, 0]),
    vector3(ratios('Axis2'), [0, 1, 0]),
    vector3(ratios('Axis3'), [0, 0, 1]),
  ];
  const m = a2p(origin, axes[2]!, axes[0]!);
  // Mirror when the supplied Axis2 opposes the right-handed Y axis.
  if (m[1]! * axes[1]![0] + m[5]! * axes[1]![1] + m[9]! * axes[1]![2] < 0) {
    for (let row = 0; row < 3; row++) m[row * 4 + 1] = -m[row * 4 + 1]!;
  }
  const scale = (inst.get('Scale') as number | null) ?? 1;
  const scales = [scale, scale, inst.isA('IfcCartesianTransformationOperator3D') ? scale : 1];
  if (inst.isA('IfcCartesianTransformationOperator3DnonUniform')) {
    scales[1] = (inst.get('Scale2') as number | null) ?? scale;
    scales[2] = (inst.get('Scale3') as number | null) ?? scale;
  } else if (inst.isA('IfcCartesianTransformationOperator2DnonUniform')) {
    scales[1] = (inst.get('Scale2') as number | null) ?? scale;
  }
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) m[row * 4 + column] = m[row * 4 + column]! * scales[column]!;
  }
  return m;
}

/** The matrix of an IfcPlacement, in the file's length unit. */
function placementMatrix(placement: EntityInstance): Matrix4 {
  const ratios = (name: string) => {
    const direction = placement.get(name) as EntityInstance | null;
    return direction ? (direction.get('DirectionRatios') as number[]) : null;
  };
  const location = (placement.get('Location') as EntityInstance).get('Coordinates') as number[];
  if (placement.isA('IfcAxis2Placement3D')) return a2p(location, vector3(ratios('Axis'), [0, 0, 1]), vector3(ratios('RefDirection'), [1, 0, 0]));
  if (placement.isA('IfcAxis2Placement2D')) return a2p(location, [0, 0, 1], vector3(ratios('RefDirection'), [1, 0, 0]));
  throw new Error(`Unsupported placement ${placement.isA()}`);
}

/** The composed matrix of an IfcObjectPlacement and its parents, in the file's length unit. */
function objectPlacementMatrix(placement: EntityInstance): Matrix4 {
  if (!placement.isA('IfcLocalPlacement')) throw new Error(`Unsupported placement ${placement.isA()}`);
  const relative = placementMatrix(placement.get('RelativePlacement') as EntityInstance);
  const parent = placement.get('PlacementRelTo') as EntityInstance | null;
  return parent ? multiply(objectPlacementMatrix(parent), relative) : relative;
}

/**
 * The 4x4 matrix of an IfcObjectPlacement (composed with its parents), an IfcPlacement or an
 * IfcCartesianTransformationOperator; the identity matrix for null. The translation is in the
 * file's length unit, or in metres with `shouldReturnSi`. IfcGridPlacement and IfcLinearPlacement
 * are not supported.
 */
export function getPlacement(options: { placement?: EntityInstance | null; shouldReturnSi?: boolean } = {}): Matrix4 {
  const placement = options.placement ?? null;
  if (placement === null) return identity();
  let m: Matrix4;
  if (placement.isA('IfcCartesianTransformationOperator')) m = _operatorPlacement(placement, false);
  else if (placement.isA('IfcObjectPlacement')) m = objectPlacementMatrix(placement);
  else m = placementMatrix(placement);
  if (options.shouldReturnSi) {
    const factor = calculateUnitScale(placement.file()!);
    for (let row = 0; row < 3; row++) m[row * 4 + 3] = m[row * 4 + 3]! * factor;
  }
  return m;
}

/** The matrix of an IfcMappedItem: its target operator applied to the origin of its source. */
export function getMappeditemTransformation(item: EntityInstance): Matrix4 {
  const source = item.get('MappingSource') as EntityInstance;
  return multiply(
    getPlacement({ placement: item.get('MappingTarget') as EntityInstance }),
    getPlacement({ placement: source.get('MappingOrigin') as EntityInstance }),
  );
}

/** A 4x4 rotation about the X, Y or Z axis. */
export function rotation(angle: number, axis: 'X' | 'Y' | 'Z', options: { isDegrees?: boolean } = {}): Matrix4 {
  const theta = (options.isDegrees ?? true) ? (angle * Math.PI) / 180 : angle;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  switch (axis) {
    case 'X':
      return new Float64Array([1, 0, 0, 0, 0, cos, -sin, 0, 0, sin, cos, 0, 0, 0, 0, 1]);
    case 'Y':
      return new Float64Array([cos, 0, sin, 0, 0, 1, 0, 0, -sin, 0, cos, 0, 0, 0, 0, 1]);
    case 'Z':
      return new Float64Array([cos, -sin, 0, 0, sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
}

/** The elevation of a storey in project units: the Z of its placement, else its Elevation, else 0. */
export function getStoreyElevation(storey: EntityInstance): number {
  const placement = storey.get('ObjectPlacement') as EntityInstance | null;
  if (placement) return getPlacement({ placement })[2 * 4 + 3]!;
  const elevation = storey.attributes().includes('Elevation') ? (storey.get('Elevation') as number | null) : null;
  return elevation || 0;
}
