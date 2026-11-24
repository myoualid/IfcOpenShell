// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.shape_builder vector functions that use numpy in Python, written by hand with TypedArrays.
// A vector is a Float64Array; a matrix is a flat row-major Float64Array (n x n: m[row * n + column]);
// a sequence of vectors is an array of Float64Arrays.
// The generated util/shape_builder re-exports them (see `hand_written` in src/transpiler/ts.yaml).

/** A vector as numbers. */
export type VectorLike = ArrayLike<number>;

function isVector(value: unknown): value is VectorLike {
  return ArrayBuffer.isView(value) || (Array.isArray(value) && (value.length === 0 || typeof value[0] === 'number'));
}

function size(matrix: ArrayLike<number>): number {
  const n = Math.round(Math.sqrt(matrix.length));
  if (n * n !== matrix.length) throw new Error(`Expected a square matrix, got ${matrix.length} values`);
  return n;
}

function dot(a: VectorLike, b: VectorLike): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

function norm(v: VectorLike): number {
  return Math.sqrt(dot(v, v));
}

function cross(a: VectorLike, b: VectorLike): Float64Array {
  return new Float64Array([a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]);
}

/** A vector or a sequence of vectors as plain arrays of numbers, safe for IFC attributes. */
export function ifcSafeVectorType(v: VectorLike | VectorLike[]): number[] | number[][] {
  return isVector(v) ? Array.from(v, Number) : Array.from(v as VectorLike[], item => Array.from(item, Number));
}

/** Each value multiplied by `siConversion`, rounded to 5 decimals, and divided again. */
export function npRoundToPrecision(v: VectorLike, siConversion: number): Float64Array {
  return Float64Array.from(v, x => Math.round(x * siConversion * 1e5) / 1e5 / siConversion);
}

/** The vector divided by its length. */
export function npNormalized(v: VectorLike): Float64Array {
  const length = norm(v);
  return Float64Array.from(v, x => x / length);
}

/** A 4x4 (or 3x3) matrix with the columns of its rotation part scaled to unit length. */
export function npMatrixNormalized(matrix: VectorLike): Float64Array {
  const n = size(matrix);
  const result = Float64Array.from(matrix);
  for (let column = 0; column < 3; column++) {
    const length = Math.hypot(matrix[column]!, matrix[n + column]!, matrix[2 * n + column]!);
    for (let row = 0; row < 3; row++) result[row * n + column] = result[row * n + column]! / length;
  }
  return result;
}

/** The point at `t` between `a` (t = 0) and `b` (t = 1). */
export function npLerp(a: VectorLike, b: VectorLike, t: number): Float64Array {
  return Float64Array.from(a, (x, i) => x + (b[i]! - x) * t);
}

/** A 2D vector with `z` added, or the first three values of a 4D vector. */
export function npTo3d(v: VectorLike, options: { z?: number } = {}): Float64Array {
  if (v.length === 2) return new Float64Array([v[0]!, v[1]!, options.z ?? 0]);
  if (v.length === 4) return new Float64Array([v[0]!, v[1]!, v[2]!]);
  throw new Error(`Unexpected vector length: ${v.length}.`);
}

/** A 2D or 3D vector extended to 4D, for example to multiply it with a 4x4 matrix. */
export function npTo4d(v: VectorLike, options: { z?: number; w?: number } = {}): Float64Array {
  const { z = 0, w = 1 } = options;
  if (v.length === 2) return new Float64Array([v[0]!, v[1]!, z, w]);
  if (v.length === 3) return new Float64Array([v[0]!, v[1]!, v[2]!, w]);
  throw new Error(`Unexpected vector length: ${v.length}.`);
}

/** A 3x3 matrix extended to 4x4, with no translation. */
export function npTo4x4(matrix3x3: VectorLike): Float64Array {
  const result = new Float64Array(16);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) result[row * 4 + column] = matrix3x3[row * 3 + column]!;
  result[15] = 1;
  return result;
}

/** Each 3D vector transformed by a 4x4 matrix. */
export function npApplyMatrix(vectors: VectorLike[], matrix: VectorLike): Float64Array[] {
  return vectors.map(v => {
    const result = new Float64Array(3);
    for (let row = 0; row < 3; row++) {
      result[row] = matrix[row * 4]! * v[0]! + matrix[row * 4 + 1]! * v[1]! + matrix[row * 4 + 2]! * v[2]! + matrix[row * 4 + 3]!;
    }
    return result;
  });
}

/** The angle between two vectors, in radians. */
export function npAngle(a: VectorLike, b: VectorLike): number {
  return Math.acos(dot(a, b) / (norm(a) * norm(b)));
}

/** The signed angle between two 2D vectors, in radians; clockwise is positive. */
export function npAngleSigned(a: VectorLike, b: VectorLike): number {
  if (a.length !== 2 || b.length !== 2) throw new Error('Only 2D vectors are supported.');
  return Math.atan2(a[1]! * b[0]! - a[0]! * b[1]!, dot(a, b));
}

/** A 4x4 identity matrix with a translation. */
export function npTranslationMatrix(vector: VectorLike): Float64Array {
  return new Float64Array([1, 0, 0, vector[0]!, 0, 1, 0, vector[1]!, 0, 0, 1, vector[2]!, 0, 0, 0, 1]);
}

/**
 * A 2x2, 3x3 or 4x4 rotation matrix of `angle` radians. A 3x3 or 4x4 matrix needs an axis: X, Y, Z
 * or a vector (Rodrigues' rotation formula).
 */
export function npRotationMatrix(angle: number, size: number, options: { axis?: 'X' | 'Y' | 'Z' | VectorLike | null } = {}): Float64Array {
  if (!(size >= 2 && size <= 4)) throw new Error(`Size must be [2;4], got ${size}.`);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  if (size === 2) return new Float64Array([cos, -sin, sin, cos]);
  const axis = options.axis;
  if (!axis) throw new Error("For non-2D matrices 'axis' argument is not optional.");
  let matrix: Float64Array;
  if (axis === 'X') matrix = new Float64Array([1, 0, 0, 0, cos, -sin, 0, sin, cos]);
  else if (axis === 'Y') matrix = new Float64Array([cos, 0, sin, 0, 1, 0, -sin, 0, cos]);
  else if (axis === 'Z') matrix = new Float64Array([cos, -sin, 0, sin, cos, 0, 0, 0, 1]);
  else {
    const [x, y, z] = npNormalized(axis as VectorLike);
    const k = [0, -z!, y!, z!, 0, -x!, -y!, x!, 0];
    const u = [x!, y!, z!];
    matrix = Float64Array.from({ length: 9 }, (_, i) => {
      const [row, column] = [Math.floor(i / 3), i % 3];
      return (row === column ? cos : 0) + (1 - cos) * u[row]! * u[column]! + sin * k[i]!;
    });
  }
  return size === 4 ? npTo4x4(matrix) : matrix;
}

/** The XYZ Euler angles of a 3x3 or 4x4 rotation matrix. */
export function npMatrixToEuler(matrix: VectorLike): [number, number, number] {
  if (matrix.length !== 9 && matrix.length !== 16) throw new Error(`Matrix must be 3x3 or 4x4, got ${matrix.length} values.`);
  const n = size(matrix);
  const m = npMatrixNormalized(matrix);
  const y = -Math.asin(m[2 * n]!);
  const cosY = Math.cos(y);
  const x = Math.atan2(m[2 * n + 1]! / cosY, m[2 * n + 2]! / cosY);
  const z = Math.atan2(m[n]! / cosY, m[0]! / cosY);
  return [x, y, z];
}

/** The unit normal of a triangle of three 3D points. */
export function npNormal(vectors: VectorLike[]): Float64Array {
  if (vectors.length !== 3) throw new Error('3 vectors required');
  const [v0, v1, v2] = vectors as [VectorLike, VectorLike, VectorLike];
  const normal = cross(Float64Array.from(v1, (x, i) => x - v0[i]!), Float64Array.from(v2, (x, i) => x - v0[i]!));
  return npNormalized(normal);
}

/** The two closest points of the lines (v1, v2) and (v3, v4). */
export function npIntersectLineLine(v1: VectorLike, v2: VectorLike, v3: VectorLike, v4: VectorLike): [Float64Array, Float64Array] {
  const d1 = Float64Array.from(v2, (x, i) => x - v1[i]!);
  const d2 = Float64Array.from(v4, (x, i) => x - v3[i]!);
  const crossD1D2 = cross(d1, d2);
  const crossNorm = norm(crossD1D2);
  // util.shape_builder.is_x(value, 0) with its PRECISION.
  if (crossNorm < 1e-5 && crossNorm > -1e-5) throw new Error('Lines are parallel and do not intersect uniquely.');
  const r = Float64Array.from(v3, (x, i) => x - v1[i]!);
  const t = dot(cross(r, d2), crossD1D2) / crossNorm ** 2;
  const u = dot(cross(r, d1), crossD1D2) / crossNorm ** 2;
  return [Float64Array.from(v1, (x, i) => x + t * d1[i]!), Float64Array.from(v3, (x, i) => x + u * d2[i]!)];
}
