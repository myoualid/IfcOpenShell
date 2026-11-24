// This file was generated with the assistance of an AI coding tool.

// api.geometry.edit_object_placement, written by hand with TypedArrays. The expected values are
// those that Python ifcopenshell.api.geometry.edit_object_placement gives for the same calls.

import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import * as feature from 'ifcopenshell/api/feature';
import * as geometry from 'ifcopenshell/api/geometry';
import * as root from 'ifcopenshell/api/root';
import * as spatial from 'ifcopenshell/api/spatial';
import * as unitApi from 'ifcopenshell/api/unit';
import * as placement from 'ifcopenshell/util/placement';
import { createInstance, describeOrSkip } from '../_helper.js';

function translation(x: number, y: number, z: number): Float64Array {
  return new Float64Array([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]);
}

function worldOrigin(product: ifcopenshell.EntityInstance): number[] {
  const m = placement.getPlacement({ placement: product.get('ObjectPlacement') as ifcopenshell.EntityInstance, shouldReturnSi: true });
  return [m[3]!, m[7]!, m[11]!];
}

function relativeLocation(product: ifcopenshell.EntityInstance): number[] {
  const local = product.get('ObjectPlacement') as ifcopenshell.EntityInstance;
  const relative = local.get('RelativePlacement') as ifcopenshell.EntityInstance;
  return (relative.get('Location') as ifcopenshell.EntityInstance).get('Coordinates') as number[];
}

function expectClose(actual: ArrayLike<number>, expected: number[]): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
}

describeOrSkip('api.geometry.edit_object_placement with TypedArrays', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it('places a storey, wall, opening and window as Python does', () => {
    using file = new ifcopenshell.File('IFC4');
    root.createEntity(file, { ifcClass: 'IfcProject' });
    unitApi.assignUnit(file);
    const storey = root.createEntity(file, { ifcClass: 'IfcBuildingStorey' });
    const wall = root.createEntity(file, { ifcClass: 'IfcWall' });
    const opening = root.createEntity(file, { ifcClass: 'IfcOpeningElement' });
    const window = root.createEntity(file, { ifcClass: 'IfcWindow' });

    geometry.editObjectPlacement(file, storey, { matrix: translation(0, 0, 3) });
    spatial.assignContainer(file, [wall], storey);
    const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
    geometry.editObjectPlacement(file, wall, { matrix: [[c, -s, 0, 1], [s, c, 0, 2], [0, 0, 1, 3], [0, 0, 0, 1]] });
    feature.addFeature(file, opening, wall);
    geometry.editObjectPlacement(file, opening, { matrix: translation(2, 2, 3.5) });
    feature.addFilling(file, opening, window);
    geometry.editObjectPlacement(file, window, { matrix: translation(2.5, 2, 3.5) });

    const wallPlacement = placement.getPlacement({ placement: wall.get('ObjectPlacement') as ifcopenshell.EntityInstance, shouldReturnSi: true });
    expectClose(wallPlacement, [c, -s, 0, 1, s, c, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1]);
    expectClose(relativeLocation(storey), [0, 0, 3000]);
    expectClose(relativeLocation(wall), [1000, 2000, 0]);
    expectClose(relativeLocation(opening), [866.025403784, -500, 500]);
    expectClose(relativeLocation(window), [500, 0, 0]);

    // The storey moves up; its children keep their world positions.
    geometry.editObjectPlacement(file, storey, { matrix: translation(0, 0, 6) });
    expectClose(worldOrigin(storey), [0, 0, 6]);
    expectClose(worldOrigin(wall), [1, 2, 3]);
    expectClose(worldOrigin(opening), [2, 2, 3.5]);
    expectClose(worldOrigin(window), [2.5, 2, 3.5]);
    expectClose(relativeLocation(wall), [1000, 2000, -3000]);

    // The wall moves 1000 mm along X, in project units, with its children.
    const moved = placement.getPlacement({ placement: wall.get('ObjectPlacement') as ifcopenshell.EntityInstance });
    moved[3] = moved[3]! + 1000;
    geometry.editObjectPlacement(file, wall, { matrix: moved, isSi: false, shouldTransformChildren: true });
    expectClose(worldOrigin(wall), [2, 2, 3]);
    expectClose(worldOrigin(opening), [3, 2, 3.5]);
    expectClose(worldOrigin(window), [3.5, 2, 3.5]);
    expectClose(relativeLocation(wall), [2000, 2000, -3000]);

    // Old placements and their points are removed.
    expect(file.byType('IfcLocalPlacement').length).toBe(4);
    expect(file.byType('IfcCartesianPoint').length).toBe(4);
  });
});
