// This file was generated with the assistance of an AI coding tool.

// ShapeBuilder methods written by hand with TypedArrays, and generated methods that call them. The
// expected values are those that Python ifcopenshell.util.shape_builder gives for the same calls.

import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import { ShapeBuilder } from 'ifcopenshell/util/shape_builder';
import { createInstance, describeOrSkip } from '../_helper.js';

type Entity = ifcopenshell.EntityInstance;

function expectClose(actual: ArrayLike<number>, expected: number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 8));
}

const at = (entity: Entity, ...path: string[]): unknown => path.reduce<unknown>((value, name) => (value as Entity).get(name), entity);
const segments = (curve: Entity) => (curve.get('Segments') as Entity[]).map(s => [s.isA(), Array.from(s.get(0) as number[])]);

describeOrSkip('ShapeBuilder methods with TypedArrays', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it('creates curves and profiles as Python does', () => {
    using file = new ifcopenshell.File('IFC4');
    const builder = new ShapeBuilder(file);

    const curve = builder.polyline([[0, 0], [1, 0], [0.707, 0.707], [0, 1]], { closed: true, positionOffset: [2, 0], arcPoints: [2] });
    expect(at(curve, 'Points', 'CoordList')).toEqual([[2, 0], [3, 0], [2.707, 0.707], [2, 1]]);
    expect(segments(curve)).toEqual([['IfcLineIndex', [1, 2]], ['IfcArcIndex', [2, 3, 4]], ['IfcLineIndex', [4, 1]]]);
    const square = builder.polyline([[0, 0], [1, 0], [1, 1], [0, 1]], { closed: true });
    expect(segments(square)).toEqual([['IfcLineIndex', [1, 2, 3, 4, 1]]]);

    const corners = ShapeBuilder.getRectangleCoords({ size: [2, 0, 3], position: [1, 1, 1] });
    expectClose(corners.flatMap(p => Array.from(p)), [1, 1, 1, 3, 1, 1, 3, 1, 4, 1, 1, 4]);
    const rectangle = builder.rectangle({ size: [2, 3] });
    expect(at(rectangle, 'Points', 'CoordList')).toEqual([[0, 0], [2, 0], [2, 3], [0, 3]]);
    expectClose(builder.getPolylineCoords(rectangle).flatMap(p => Array.from(p)), [0, 0, 2, 0, 2, 3, 0, 3]);

    const arc = builder.curveBetweenTwoPoints([[0, 0], [0, 2]]);
    expect(at(arc, 'Points', 'CoordList')).toEqual([[0, 0], [0, 0.01], [0, 2]]);

    builder.translate(square, [1, 1]);
    expect(at(square, 'Points', 'CoordList')).toEqual([[1, 1], [2, 1], [2, 2], [1, 2]]);
  });

  it('creates placements, planes and extrusions as Python does', () => {
    using file = new ifcopenshell.File('IFC4');
    const builder = new ShapeBuilder(file);

    const plane = builder.plane({ location: [1, 2, 3], normal: [1, 0, 0] });
    expect(at(plane, 'Position', 'Location', 'Coordinates')).toEqual([1, 2, 3]);
    expect(at(plane, 'Position', 'Axis', 'DirectionRatios')).toEqual([1, 0, 0]);
    expectClose(at(plane, 'Position', 'RefDirection', 'DirectionRatios') as number[], [0, -1, 0]);

    const axis = builder.createAxis2Placement3dFromMatrix({ matrix: [0, -1, 0, 5, 1, 0, 0, 6, 0, 0, 1, 7, 0, 0, 0, 1] });
    expect(at(axis, 'Location', 'Coordinates')).toEqual([5, 6, 7]);
    expect(at(axis, 'Axis', 'DirectionRatios')).toEqual([0, 0, 1]);
    expect(at(axis, 'RefDirection', 'DirectionRatios')).toEqual([0, 1, 0]);

    // ShapeBuilder.profile reads the derived attribute Dim, which needs the EXPRESS rules: it is a stub.
    const profile = file.create('IfcArbitraryClosedProfileDef', { ProfileType: 'AREA', OuterCurve: builder.rectangle({ size: [1, 2] }) });
    const solid = builder.extrude(profile, { magnitude: 3, position: [1, 0, 0], positionXAxis: [0, 1, 0], positionYAxis: [0, 0, 1] });
    expect(solid.get('Depth')).toBe(3);
    expect(at(solid, 'Position', 'Axis', 'DirectionRatios')).toEqual([1, 0, 0]);
    expect(at(solid, 'Position', 'RefDirection', 'DirectionRatios')).toEqual([0, 1, 0]);
    expect(at(solid, 'ExtrudedDirection', 'DirectionRatios')).toEqual([0, 0, 1]);
    expect((solid.get('SweptArea') as Entity).isA()).toBe('IfcArbitraryClosedProfileDef');

    const kwargs = builder.rotateExtrusionKwargsByZ(builder.extrudeKwargs('Y'), Math.PI / 2);
    expectClose(kwargs.position_x_axis!, [0, -1, 0]);
    expectClose(kwargs.position_z_axis!, [-1, 0, 0]);
    expect(kwargs.extrusion_vector).toEqual([0, 0, -1]);
  });

  it('rotates and mirrors 2D points as Python does', () => {
    using file = new ifcopenshell.File('IFC4');
    const builder = new ShapeBuilder(file);
    expectClose(builder.rotate2dPoint([1, 0], { angle: 90, pivotPoint: [0, 0] }), [0, -1]);
    expectClose(builder.rotate2dPoint([2, 1], { angle: 45, pivotPoint: [1, 1], counterClockwise: true }), [1.707106781, 1.707106781]);
    expectClose(builder.mirror2dPoint([2, 3], { mirrorAxes: [1, 0], mirrorPoint: [1, 1] }), [0, 3]);
  });
});
