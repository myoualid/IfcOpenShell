// This file was generated with the assistance of an AI coding tool.

// util.geolocation, written by hand with TypedArrays. The expected values are those that Python
// ifcopenshell.util.geolocation gives for the same calls.

import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import * as context from 'ifcopenshell/api/context';
import * as root from 'ifcopenshell/api/root';
import * as unitApi from 'ifcopenshell/api/unit';
import * as geolocation from 'ifcopenshell/util/geolocation';
import { createInstance, describeOrSkip } from '../_helper.js';

function expectClose(actual: ArrayLike<number>, expected: number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 5));
}

describeOrSkip('util.geolocation with TypedArrays', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  const [c, s] = [Math.cos(0.3), Math.sin(0.3)];
  const local = new Float64Array([c, -s, 0, 5000, s, c, 0, 3000, 0, 0, 1, 1000, 0, 0, 0, 1]);

  it('applies a given Helmert transformation as Python does', () => {
    const options = { eastings: 100, northings: 200, orthogonalHeight: 3, xAxisAbscissa: 0.8, xAxisOrdinate: 0.6, scale: 0.5, factorX: 1, factorY: 2, factorZ: 1 };
    expectClose(geolocation.local2global(local, options), [0.364652, -0.71523, 0, 300, 0.931144, 0.698889, 0, 4100, 0, 0, 1, 503, 0, 0, 0, 1]);
    expectClose(geolocation.global2local(local, options), [0.984382, 0.581818, 0, 11200, -0.176047, 0.813319, 0, -700, 0, 0, 1, 1994, 0, 0, 0, 1]);
  });

  it('applies the map conversion and world coordinate system of a file as Python does', () => {
    using file = new ifcopenshell.File('IFC4');
    root.createEntity(file, { ifcClass: 'IfcProject' });
    unitApi.assignUnit(file);
    const model = context.addContext(file, { contextType: 'Model' });
    model.set('WorldCoordinateSystem', file.create('IfcAxis2Placement3D', [file.create('IfcCartesianPoint', [[1000, 2000, 0]]), null, null]));
    const crs = file.create('IfcProjectedCRS', { Name: 'EPSG:7856' });
    file.create('IfcMapConversion', {
      SourceCRS: model, TargetCRS: crs, Eastings: 500000, Northings: 6000000, OrthogonalHeight: 10, XAxisAbscissa: 0.8, XAxisOrdinate: 0.6, Scale: 0.001,
    });

    expectClose(geolocation.autoXyz2enh(file, 5000, 3000, 1000), [500002.6, 6000003.2, 11]);
    expectClose(geolocation.autoXyz2enh(file, 5000, 3000, 1000, { shouldReturnInMapUnits: false }), [500002600, 6000003200, 11000]);
    expectClose(geolocation.autoEnh2xyz(file, 500003, 6000002, 11), [4600, 1800, 1000]);
    expectClose(geolocation.autoEnh2xyz(file, 500003000, 6000002000, 11000, { isSpecifiedInMapUnits: false }), [4600, 1800, 1000]);

    const global = geolocation.autoLocal2global(file, local);
    expectClose(global, [0.586957, -0.809618, 0, 500002.6, 0.809618, 0.586957, 0, 6000003.2, 0, 0, 1, 11, 0, 0, 0, 1]);
    const inProjectUnits = geolocation.autoLocal2global(file, local, { shouldReturnInMapUnits: false });
    expectClose(inProjectUnits, [0.586957, -0.809618, 0, 500002600, 0.809618, 0.586957, 0, 6000003200, 0, 0, 1, 11000, 0, 0, 0, 1]);
    const back = [c, -s, 0, 5000, s, c, 0, 3000, 0, 0, 1, 1000, 0, 0, 0, 1];
    expectClose(geolocation.autoGlobal2local(file, global), back);
    expectClose(geolocation.autoGlobal2local(file, inProjectUnits, { isSpecifiedInMapUnits: false }), back);
  });

  it('returns the values unchanged without a map conversion', () => {
    using file = new ifcopenshell.File('IFC4');
    expect(geolocation.autoXyz2enh(file, 1, 2, 3)).toEqual([1, 2, 3]);
    expectClose(geolocation.autoLocal2global(file, local), Array.from(local));
  });
});
