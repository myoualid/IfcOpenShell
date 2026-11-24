// This file was generated with the assistance of an AI coding tool.

// util.shape_builder vector functions, written by hand with TypedArrays. The expected values are
// those that Python ifcopenshell.util.shape_builder gives for the same calls.

import { expect, it } from 'vitest';
import * as sb from 'ifcopenshell/util/shape_builder';
import { describeOrSkip } from '../_helper.js';

function expectClose(actual: ArrayLike<number>, expected: number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 8));
}

function multiply3(a: ArrayLike<number>, b: ArrayLike<number>): Float64Array {
  return Float64Array.from({ length: 9 }, (_, i) => {
    const [row, column] = [Math.floor(i / 3), i % 3];
    return a[row * 3]! * b[column]! + a[row * 3 + 1]! * b[3 + column]! + a[row * 3 + 2]! * b[6 + column]!;
  });
}

describeOrSkip('util.shape_builder vector functions with TypedArrays', () => {
  const m = new Float64Array([2, 0, 0, 5, 0, 3, 0, 6, 0, 0, 4, 7, 0, 0, 0, 1]);

  it('converts vectors as Python does', () => {
    expect(sb.ifcSafeVectorType(new Float64Array([1, 2.5]))).toEqual([1, 2.5]);
    expectClose(sb.npRoundToPrecision([1.234567891, 2], 0.001), [1.23, 2]);
    expectClose(sb.npNormalized([3, 4, 0]), [0.6, 0.8, 0]);
    expectClose(sb.npMatrixNormalized(m), [1, 0, 0, 5, 0, 1, 0, 6, 0, 0, 1, 7, 0, 0, 0, 1]);
    expectClose(sb.npLerp([0, 0, 0], [2, 4, 6], 0.25), [0.5, 1, 1.5]);
    expectClose(sb.npTo3d([1, 2], { z: 5 }), [1, 2, 5]);
    expectClose(sb.npTo3d([1, 2, 3, 4]), [1, 2, 3]);
    expectClose(sb.npTo4d([1, 2]), [1, 2, 0, 1]);
    expectClose(sb.npTo4d([1, 2, 3], { w: 0 }), [1, 2, 3, 0]);
    expectClose(sb.npTo4x4([0, 1, 2, 3, 4, 5, 6, 7, 8]), [0, 1, 2, 0, 3, 4, 5, 0, 6, 7, 8, 0, 0, 0, 0, 1]);
    const applied = sb.npApplyMatrix([[1, 0, 0], [0, 1, 0]], m);
    expectClose([...applied[0]!, ...applied[1]!], [7, 6, 7, 5, 9, 7]);
  });

  it('computes angles, matrices and intersections as Python does', () => {
    expect(sb.npAngle([1, 0, 0], [1, 1, 0])).toBeCloseTo(0.785398163, 8);
    expect(sb.npAngleSigned([1, 0], [0, 1])).toBeCloseTo(-1.570796327, 8);
    expectClose(sb.npTranslationMatrix([1, 2, 3]), [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1]);
    expectClose(sb.npRotationMatrix(0.5, 2), [0.877582562, -0.479425539, 0.479425539, 0.877582562]);
    expectClose(sb.npRotationMatrix(0.5, 3, { axis: 'Y' }), [0.877582562, 0, 0.479425539, 0, 1, 0, -0.479425539, 0, 0.877582562]);
    expectClose(sb.npRotationMatrix(0.5, 4, { axis: [1, 1, 1] }), [
      0.918388375, -0.235990651, 0.317602276, 0, 0.317602276, 0.918388375, -0.235990651, 0, -0.235990651, 0.317602276, 0.918388375, 0, 0, 0, 0, 1,
    ]);
    const r = multiply3(multiply3(sb.npRotationMatrix(0.3, 3, { axis: 'X' }), sb.npRotationMatrix(0.2, 3, { axis: 'Y' })), sb.npRotationMatrix(0.1, 3, { axis: 'Z' }));
    expectClose(sb.npMatrixToEuler(r), [0.322609691, 0.16002722, 0.156419513]);
    expectClose(sb.npNormal([[0, 0, 0], [1, 0, 0], [0, 1, 0]]), [0, 0, 1]);
    const [p, q] = sb.npIntersectLineLine([0, 0, 0], [1, 0, 0], [0.5, -1, 1], [0.5, 1, 1]);
    expectClose([...p, ...q], [0.5, 0, 0, 0.5, 0, 1]);
    expect(() => sb.npIntersectLineLine([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0])).toThrow('parallel');
  });
});
