// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.geolocation functions that use numpy in Python, written by hand with TypedArrays.
// Matrices are 4x4 Float64Arrays in row-major order (see helpers/placement.ts).
// The generated util/geolocation re-exports them (see `hand_written` in src/transpiler/ts.yaml).

import type { File } from '../file.js';
import { enh2xyz, getHelmertTransformationParameters, getWcs, xyz2enh } from '../util/geolocation.js';
import { invert, multiply, type Matrix4 } from './placement.js';

/** Helmert transformation parameters, as in IfcMapConversion. */
export interface HelmertOptions {
  eastings?: number;
  northings?: number;
  orthogonalHeight?: number;
  xAxisAbscissa?: number;
  xAxisOrdinate?: number;
  scale?: number;
  factorX?: number;
  factorY?: number;
  factorZ?: number;
}

/** The fields of util.geolocation HelmertTransformation, as getHelmertTransformationParameters gives them. */
interface HelmertTransformation {
  e: number;
  n: number;
  h: number;
  xaa: number;
  xao: number;
  scale: number;
  factor_x: number;
  factor_y: number;
  factor_z: number;
}

/** The options of the generated functions for the parameters of a Helmert transformation. */
function helmertOptions(parameters: HelmertTransformation): Required<HelmertOptions> {
  return {
    eastings: parameters.e,
    northings: parameters.n,
    orthogonalHeight: parameters.h,
    xAxisAbscissa: parameters.xaa,
    xAxisOrdinate: parameters.xao,
    scale: parameters.scale,
    factorX: parameters.factor_x,
    factorY: parameters.factor_y,
    factorZ: parameters.factor_z,
  };
}

/** The matrix `m` times the point (x, y, z, 1): the transformed point. */
function transformPoint(m: Matrix4, x: number, y: number, z: number): [number, number, number] {
  const p = [x, y, z, 1];
  const result: number[] = [];
  for (let row = 0; row < 3; row++) result.push(m[row * 4]! * p[0]! + m[row * 4 + 1]! * p[1]! + m[row * 4 + 2]! * p[2]! + m[row * 4 + 3]!);
  return result as [number, number, number];
}

/** The rotation and scale matrices of a Helmert transformation. */
function helmertMatrices(options: HelmertOptions): [Matrix4, Matrix4] {
  const { xAxisAbscissa = 1, xAxisOrdinate = 0, scale = 1, factorX = 1, factorY = 1, factorZ = 1 } = options;
  const theta = Math.atan2(xAxisOrdinate, xAxisAbscissa);
  const [cos, sin] = [Math.cos(theta), Math.sin(theta)];
  const rotation = new Float64Array([cos, -sin, 0, 0, sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const scaleAndFactor = new Float64Array([scale * factorX, 0, 0, 0, 0, scale * factorY, 0, 0, 0, 0, scale * factorZ, 0, 0, 0, 0, 1]);
  return [rotation, scaleAndFactor];
}

/** Scales the first three columns of `m` to unit length. */
function normalizeAxes(m: Matrix4): void {
  for (let column = 0; column < 3; column++) {
    const length = Math.hypot(m[column]!, m[4 + column]!, m[8 + column]!);
    for (let row = 0; row < 3; row++) m[row * 4 + column] = m[row * 4 + column]! / length;
  }
}

/**
 * Converts local XYZ coordinates (project units) to map eastings, northings and heights, with the
 * map conversion of the file. Without a map conversion, the coordinates are returned unchanged.
 */
export function autoXyz2enh(
  ifcFile: File,
  x: number,
  y: number,
  z: number,
  options: { shouldReturnInMapUnits?: boolean } = {},
): [number, number, number] {
  const parameters = getHelmertTransformationParameters(ifcFile);
  if (!parameters) return [x, y, z];
  const wcs = getWcs(ifcFile) as Matrix4 | null;
  if (wcs) [x, y, z] = transformPoint(invert(wcs), x, y, z);
  const enh = xyz2enh(x, y, z, helmertOptions(parameters));
  if (options.shouldReturnInMapUnits ?? true) return enh;
  return [enh[0] / parameters.scale, enh[1] / parameters.scale, enh[2] / parameters.scale];
}

/**
 * Converts map eastings, northings and heights to local XYZ coordinates (project units), with
 * the map conversion of the file. Without a map conversion, the coordinates are returned unchanged.
 */
export function autoEnh2xyz(
  ifcFile: File,
  easting: number,
  northing: number,
  height: number,
  options: { isSpecifiedInMapUnits?: boolean } = {},
): [number, number, number] {
  const parameters = getHelmertTransformationParameters(ifcFile);
  if (!parameters) return [easting, northing, height];
  if (!(options.isSpecifiedInMapUnits ?? true)) {
    easting *= parameters.scale;
    northing *= parameters.scale;
    height *= parameters.scale;
  }
  const xyz = enh2xyz(easting, northing, height, helmertOptions(parameters));
  const wcs = getWcs(ifcFile) as Matrix4 | null;
  return wcs ? transformPoint(wcs, ...xyz) : xyz;
}

/** Converts a local 4x4 matrix to global map coordinates with the given Helmert transformation. */
export function local2global(matrix: Matrix4, options: HelmertOptions = {}): Matrix4 {
  const [rotation, scaleAndFactor] = helmertMatrices(options);
  const result = multiply(multiply(rotation, scaleAndFactor), matrix);
  normalizeAxes(result);
  result[3] = result[3]! + (options.eastings ?? 0);
  result[7] = result[7]! + (options.northings ?? 0);
  result[11] = result[11]! + (options.orthogonalHeight ?? 0);
  return result;
}

/**
 * Converts a local 4x4 matrix (project units) to global map coordinates with the map conversion
 * of the file. Without a map conversion, a copy of the matrix is returned.
 */
export function autoLocal2global(ifcFile: File, matrix: Matrix4, options: { shouldReturnInMapUnits?: boolean } = {}): Matrix4 {
  const parameters = getHelmertTransformationParameters(ifcFile);
  if (!parameters) return Float64Array.from(matrix);
  const wcs = getWcs(ifcFile) as Matrix4 | null;
  if (wcs) matrix = multiply(invert(wcs), matrix);
  const result = local2global(matrix, helmertOptions(parameters));
  if (options.shouldReturnInMapUnits ?? true) return result;
  for (let row = 0; row < 3; row++) result[row * 4 + 3] = result[row * 4 + 3]! / parameters.scale;
  return result;
}

/** Converts a global 4x4 map matrix to local coordinates with the given Helmert transformation. */
export function global2local(matrix: Matrix4, options: HelmertOptions = {}): Matrix4 {
  const [rotation, scaleAndFactor] = helmertMatrices(options);
  let result: Matrix4 = Float64Array.from(matrix);
  result[3] = result[3]! - (options.eastings ?? 0);
  result[7] = result[7]! - (options.northings ?? 0);
  result[11] = result[11]! - (options.orthogonalHeight ?? 0);
  result = multiply(multiply(invert(scaleAndFactor), invert(rotation)), result);
  normalizeAxes(result);
  return result;
}

/**
 * Converts a global 4x4 map matrix to local coordinates (project units) with the map conversion
 * of the file. Without a map conversion, a copy of the matrix is returned.
 */
export function autoGlobal2local(ifcFile: File, matrix: Matrix4, options: { isSpecifiedInMapUnits?: boolean } = {}): Matrix4 {
  const parameters = getHelmertTransformationParameters(ifcFile);
  if (!parameters) return Float64Array.from(matrix);
  if (!(options.isSpecifiedInMapUnits ?? true)) {
    matrix = Float64Array.from(matrix);
    for (let row = 0; row < 3; row++) matrix[row * 4 + 3] = matrix[row * 4 + 3]! * parameters.scale;
  }
  const result = global2local(matrix, helmertOptions(parameters));
  const wcs = getWcs(ifcFile) as Matrix4 | null;
  return wcs ? multiply(wcs, result) : result;
}
