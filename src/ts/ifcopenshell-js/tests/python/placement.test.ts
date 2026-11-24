// This file was generated with the assistance of an AI coding tool.

// util.placement, written by hand with TypedArrays. The expected matrices are those that Python
// ifcopenshell.util.placement gives for the same input.

import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import * as root from 'ifcopenshell/api/root';
import * as unitApi from 'ifcopenshell/api/unit';
import * as placement from 'ifcopenshell/util/placement';
import { createInstance, describeOrSkip } from '../_helper.js';

function expectMatrix(actual: Float64Array, expected: number[]): void {
  expect(actual).toBeInstanceOf(Float64Array);
  expect(actual.length).toBe(16);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 9));
}

describeOrSkip('util.placement with TypedArrays', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it('builds matrices from axes and rotations', () => {
    expectMatrix(placement.a2p([1, 2, 3], [0, 0, 2], [0, 1, 0]), [0, -1, 0, 1, 1, 0, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1]);
    expectMatrix(placement.rotation(90, 'Z'), [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expectMatrix(placement.rotation(Math.PI / 2, 'X', { isDegrees: false }), [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]);
  });

  it('composes placements, operators and mapped items', () => {
    using file = new ifcopenshell.File('IFC4');
    root.createEntity(file, { ifcClass: 'IfcProject' });
    unitApi.assignUnit(file); // millimetres
    const point = (Coordinates: number[]) => file.create('IfcCartesianPoint', { Coordinates });
    const direction = (DirectionRatios: number[]) => file.create('IfcDirection', { DirectionRatios });
    const parent = file.create('IfcLocalPlacement', {
      RelativePlacement: file.create('IfcAxis2Placement3D', {
        Location: point([1000, 0, 0]), Axis: direction([0, 0, 1]), RefDirection: direction([0, 1, 0]),
      }),
    });
    const child = file.create('IfcLocalPlacement', {
      PlacementRelTo: parent,
      RelativePlacement: file.create('IfcAxis2Placement3D', { Location: point([0, 500, 250]) }),
    });
    const operator = file.create('IfcCartesianTransformationOperator3D', {
      LocalOrigin: point([10, 20, 30]), Axis1: direction([0, 1, 0]), Scale: 2,
    });
    const origin2d = file.create('IfcAxis2Placement2D', { Location: point([5, 6]), RefDirection: direction([0, 1]) });
    const map = file.create('IfcRepresentationMap', {
      MappingOrigin: file.create('IfcAxis2Placement3D', { Location: point([1, 2, 3]) }),
    });
    const item = file.create('IfcMappedItem', { MappingSource: map, MappingTarget: operator });

    expectMatrix(placement.getPlacement(), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expectMatrix(placement.getPlacement({ placement: child }), [0, -1, 0, 500, 1, 0, 0, 0, 0, 0, 1, 250, 0, 0, 0, 1]);
    expectMatrix(placement.getPlacement({ placement: child, shouldReturnSi: true }), [0, -1, 0, 0.5, 1, 0, 0, 0, 0, 0, 1, 0.25, 0, 0, 0, 1]);
    expectMatrix(placement.getPlacement({ placement: operator }), [0, -2, 0, 10, 2, 0, 0, 20, 0, 0, 2, 30, 0, 0, 0, 1]);
    expectMatrix(placement.getPlacement({ placement: origin2d }), [0, -1, 0, 5, 1, 0, 0, 6, 0, 0, 1, 0, 0, 0, 0, 1]);
    expectMatrix(placement.getMappeditemTransformation(item), [0, -2, 0, 6, 2, 0, 0, 22, 0, 0, 2, 36, 0, 0, 0, 1]);
  });
});
