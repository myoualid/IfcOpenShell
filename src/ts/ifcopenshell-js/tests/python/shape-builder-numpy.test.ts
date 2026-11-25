// This file was generated with the assistance of an AI coding tool.

// ShapeBuilder methods that use numpy in Python, written by hand with arrays in TS. Each test makes
// the call of the case of the same name in fixtures/shape-builder-numpy.json, which holds what Python
// ifcopenshell.util.shape_builder gives.

import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import { ShapeBuilder, V } from 'ifcopenshell/util/shape_builder';
import { createInstance, describeOrSkip } from '../_helper.js';
import { difference, graph } from './_graph.js';

type Entity = ifcopenshell.EntityInstance;

const fixture = JSON.parse(readFileSync(new URL('./fixtures/shape-builder-numpy.json', import.meta.url), 'utf-8')) as {
  base: string;
  cases: Record<string, unknown>;
};

const calls: Record<string, (b: ShapeBuilder) => unknown> = {
  'rotate a polyline, a circle and an extrusion': b => {
    const polyline = b.polyline([[0, 0], [2, 0], [2, 1]], { closed: true });
    const circle = b.circle({ center: [1, 1], radius: 0.5 });
    const extrusion = b.extrude(b.profile(b.rectangle({ size: [1, 2] })), { magnitude: 3, position: [1, 2, 0.5] });
    b.rotate(polyline, { angle: 30, pivotPoint: [1, 0] });
    b.rotate(circle, { angle: 45, pivotPoint: [0, 0], counterClockwise: true });
    b.rotate(extrusion, { angle: 90, pivotPoint: [0, 0] });
    const copy = b.rotate(polyline, { angle: 15, createCopy: true }) as Entity;
    return graph([polyline, circle, extrusion, copy]);
  },
  'mirror polylines, trimmed curves and extrusions': b => {
    const polyline = b.polyline([[0, 0], [2, 0], [2, 1]]);
    const ellipse = b.createEllipseCurve(2, 1, { trimPointsMask: [0, 1], position: [1, 0] });
    const kwargs = b.extrudeKwargs('Y');
    const extrusion = b.extrude(b.profile(b.rectangle({ size: [1, 2] })), {
      magnitude: 3,
      position: [1, 2, 0.5],
      positionXAxis: kwargs.position_x_axis,
      positionZAxis: kwargs.position_z_axis,
      extrusionVector: kwargs.extrusion_vector,
    });
    b.mirror(polyline, { mirrorAxes: [1, 0], mirrorPoint: [1, 0] });
    const mirrored = b.mirror(ellipse, { mirrorAxes: [[1, 0], [0, 1]], mirrorPoint: [0, 0], createCopy: true }) as Entity[];
    b.mirror(extrusion, { mirrorAxes: [0, 1], mirrorPoint: [0, 1] });
    return graph([polyline, ellipse, ...mirrored, extrusion]);
  },
  'trim points from a mask': b => [b.getTrimPointsFromMask(2, 1, [0, 3]), b.getTrimPointsFromMask(2, 1, [2, 1], { positionOffset: [1, 1] })],
  'a 2D curve with fillets': b => {
    const [points, segments, curve] = b.getSimple2dcurveData([[0, 0], [4, 0], [4, 3], [0, 3]], {
      fillets: [1, 2],
      filletRadius: 0.5,
      closed: true,
      createIfcCurve: true,
    });
    const [openPoints, openSegments] = b.getSimple2dcurveData([[0, 0], [2, 0], [2, 2]], { fillets: [1], filletRadius: [2.0], closed: false });
    return { points, segments, curve: graph(curve as Entity), open: [openPoints, openSegments] };
  },
  'a face surface': b => graph(b.faceSurface([[0, 0, 0], [2, 0, 0], [2, 1, 1], [0, 1, 1]])),
  V: () => [V(1, 2, 3), V([1, 2]), V([[0, 0], [1, 0]])],
};

describeOrSkip('ShapeBuilder methods that use numpy in Python', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it('has a call for each Python case', () => {
    expect(Object.keys(calls).sort()).toEqual(Object.keys(fixture.cases).sort());
  });

  it.each(Object.keys(fixture.cases))('%s as Python does', name => {
    using file = ifcopenshell.File.fromString(fixture.base);
    expect(difference(calls[name]!(new ShapeBuilder(file)), fixture.cases[name])).toBeNull();
  });
});
