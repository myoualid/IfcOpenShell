// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// Vector and matrix functions for the generated code (see `runtime_modules` in src/transpiler/ts.yaml).
// A vector is an array of numbers and a matrix is an array of rows. There is no broadcasting between
// shapes: an operation takes two operands of the same shape, or one of them and a number.

export type Vector = number[];
export type Matrix = number[][];

/**
 * The type that the generated code gives a value that Python types as a numpy array. Python types do not
 * give the shape (vector or matrix), so the generated code cannot tell them apart.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NDArray = any;

type Operand = number | Vector | Matrix;

/** A copy of a vector or a matrix (also of typed arrays and tuples) as arrays of numbers. */
export function array<T extends Vector | Matrix>(value: T | ArrayLike<number> | ArrayLike<ArrayLike<number>>): T {
  return Array.from(value as ArrayLike<number | ArrayLike<number>>, item => (typeof item === 'number' ? item : Array.from(item))) as T;
}
export const copy = array;

function elementwise(a: Operand, b: Operand, f: (x: number, y: number) => number): Operand {
  if (typeof a === 'number' && typeof b === 'number') return f(a, b);
  if (typeof a === 'number') return (b as Vector).map(y => elementwise(a, y, f)) as Operand;
  if (typeof b === 'number') return (a as Vector).map(x => elementwise(x, b, f)) as Operand;
  if (a.length !== b.length) throw new RangeError(`Shapes differ: ${a.length} and ${b.length} items`);
  return a.map((x, i) => {
    const y = b[i]!;
    if (typeof x !== typeof y) throw new RangeError('Shapes differ: a vector and a matrix');
    return elementwise(x, y, f);
  }) as Operand;
}

// Element-wise arithmetic of two operands of the same shape, or of one operand and a number.
export const add = <T extends Operand>(a: T | number, b: T | number): T => elementwise(a, b, (x, y) => x + y) as T;
export const subtract = <T extends Operand>(a: T | number, b: T | number): T => elementwise(a, b, (x, y) => x - y) as T;
export const multiply = <T extends Operand>(a: T | number, b: T | number): T => elementwise(a, b, (x, y) => x * y) as T;
export const divide = <T extends Operand>(a: T | number, b: T | number): T => elementwise(a, b, (x, y) => x / y) as T;
export const negative = <T extends Operand>(a: T): T => elementwise(a, -1, (x, y) => x * y) as T;

const isMatrix = (a: Vector | Matrix): a is Matrix => Array.isArray(a[0]);

function dotVectors(a: Vector, b: Vector): number {
  if (a.length !== b.length) throw new RangeError(`Shapes differ: ${a.length} and ${b.length} items`);
  return a.reduce((sum, x, i) => sum + x * b[i]!, 0);
}

/** The rows of a matrix as columns. */
export function transpose(m: Matrix): Matrix {
  return m[0]!.map((_, j) => m.map(row => row[j]!));
}

/** The dot product of two vectors, or the product of a matrix and a vector or a matrix. */
export function dot(a: Vector, b: Vector): number;
export function dot(a: Matrix, b: Vector): Vector;
export function dot(a: Vector, b: Matrix): Vector;
export function dot(a: Matrix, b: Matrix): Matrix;
export function dot(a: Vector | Matrix, b: Vector | Matrix): number | Vector | Matrix {
  if (!isMatrix(a)) return isMatrix(b) ? transpose(b).map(column => dotVectors(a, column)) : dotVectors(a, b);
  if (!isMatrix(b)) return a.map(row => dotVectors(row, b));
  const columns = transpose(b);
  return a.map(row => columns.map(column => dotVectors(row, column)));
}

/** The product of a matrix and a vector or a matrix. */
export function matmul(a: Matrix, b: Matrix): Matrix;
export function matmul(a: Matrix, b: Vector): Vector;
export function matmul(a: Vector, b: Matrix): Vector;
export function matmul(a: Vector | Matrix, b: Vector | Matrix): Vector | Matrix {
  return (dot as (a: Vector | Matrix, b: Vector | Matrix) => Vector | Matrix)(a, b);
}

/** The cross product of two 3D vectors. */
export function cross(a: Vector, b: Vector): Vector {
  if (a.length !== 3 || b.length !== 3) throw new RangeError('The cross product takes two 3D vectors');
  const [ax, ay, az] = a as [number, number, number];
  const [bx, by, bz] = b as [number, number, number];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/** The Euclidean length of a vector. */
export function norm(v: Vector): number {
  return Math.hypot(...v);
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

/** A vector of n zeros, or a matrix of zeros for [rows, columns]. */
export function zeros(n: number): Vector;
export function zeros(shape: [number, number]): Matrix;
export function zeros(shape: number | [number, number]): Vector | Matrix {
  if (typeof shape === 'number') return new Array<number>(shape).fill(0);
  return Array.from({ length: shape[0] }, () => new Array<number>(shape[1]).fill(0));
}

/** The inverse of a square matrix (Gauss-Jordan elimination with partial pivoting). */
export function inverse(m: Matrix): Matrix {
  const a = m.map(row => [...row]);
  const n = a.length;
  const result = identity(n);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) pivot = row;
    if (a[pivot]![column] === 0) throw new Error('Singular matrix');
    [a[column], a[pivot]] = [a[pivot]!, a[column]!];
    [result[column], result[pivot]] = [result[pivot]!, result[column]!];
    const p = a[column]![column]!;
    for (let k = 0; k < n; k++) {
      a[column]![k]! /= p;
      result[column]![k]! /= p;
    }
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const f = a[row]![column]!;
      if (f === 0) continue;
      for (let k = 0; k < n; k++) {
        a[row]![k]! -= f * a[column]![k]!;
        result[row]![k]! -= f * result[column]![k]!;
      }
    }
  }
  return result;
}

/** Whether two numbers are equal within a tolerance: |a - b| <= atol + rtol * |b|. */
export function isclose(a: number, b: number, options: { rtol?: number; atol?: number } = {}): boolean {
  return Math.abs(a - b) <= (options.atol ?? 1e-8) + (options.rtol ?? 1e-5) * Math.abs(b);
}

/** Whether all the numbers of two operands of the same shape are equal within a tolerance. */
export function allclose<T extends Operand>(a: T | number, b: T | number, options: { rtol?: number; atol?: number } = {}): boolean {
  const close = elementwise(a, b, (x, y) => Number(isclose(x, y, options)));
  return [close].flat(2).every(Boolean);
}

/** Whether two operands have the same shape and equal numbers. */
export function arrayEqual(a: Operand, b: Operand): boolean {
  if (typeof a === 'number' || typeof b === 'number') return a === b;
  return a.length === b.length && a.every((x, i) => arrayEqual(x, b[i]!));
}

/** Set a part of a column of a matrix, from the row `rowStart`. */
export function setColumn(m: Matrix, column: number, values: Iterable<number>, rowStart = 0): void {
  Array.from(values).forEach((value, i) => (m[rowStart + i]![column] = value));
}

/** Set a part of a row of a matrix, from the column `columnStart`. */
export function setRow(m: Matrix, row: number, values: Iterable<number>, columnStart = 0): void {
  Array.from(values).forEach((value, j) => (m[row]![columnStart + j] = value));
}

/** Set a block of a matrix, from the row `rowStart` and the column `columnStart`. */
export function setSubMatrix(m: Matrix, block: Iterable<Iterable<number>>, rowStart = 0, columnStart = 0): void {
  Array.from(block).forEach((values, i) => setRow(m, rowStart + i, values, columnStart));
}
