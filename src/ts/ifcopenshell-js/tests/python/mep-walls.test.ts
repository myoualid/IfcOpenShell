// This file was generated with the assistance of an AI coding tool.

// MEP transition and bend shapes, face set extrusions and wall regeneration, written by hand with
// arrays in TS. Each test makes the call of the case of the same name in fixtures/mep-walls.json on
// the file of that case; the fixture holds what Python ifcopenshell gives.

import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import * as geometry from 'ifcopenshell/api/geometry';
import { getPlacement } from 'ifcopenshell/util/placement';
import { ShapeBuilder } from 'ifcopenshell/util/shape_builder';
import { createInstance, describeOrSkip } from '../_helper.js';
import { difference, graph } from './_graph.js';

type Entity = ifcopenshell.EntityInstance;

const fixture = JSON.parse(readFileSync(new URL('./fixtures/mep-walls.json', import.meta.url), 'utf-8')) as {
  cases: Record<string, { file: string; ids: number[]; expected: unknown }>;
};

const transition = (angle: number, profileOffset: number[]) => (f: ifcopenshell.File, ids: number[]) => {
  const [representation, data] = new ShapeBuilder(f).mepTransitionShape(f.byId(ids[0]!), f.byId(ids[1]!), 0.1, 0.1, { angle, profileOffset });
  return representation === null ? null : { representation: graph(representation), data };
};

const bend = (radius: number, bendVector: number[], flip: boolean) => (f: ifcopenshell.File, ids: number[]) => {
  const [representation, data] = new ShapeBuilder(f).mepBendShape(f.byId(ids[0]!), 0.1, 0.2, (60 * Math.PI) / 180, radius, bendVector, flip);
  return { representation: graph(representation), data };
};

const walls = (f: ifcopenshell.File, ids: number[]) => {
  for (const id of ids) geometry.regenerateWallRepresentation(f, f.byId(id));
  return ids.map(id => {
    const wall = f.byId(id);
    const matrix = getPlacement({ placement: wall.get('ObjectPlacement') as Entity });
    return {
      representations: ((wall.get('Representation') as Entity).get('Representations') as Entity[]).map(r => graph(r)),
      placement: [0, 1, 2, 3].map(row => Array.from(matrix.subarray(row * 4, row * 4 + 4))),
    };
  });
};

const calls: Record<string, (f: ifcopenshell.File, ids: number[]) => unknown> = {
  'a transition between rectangles': transition(30.0, [0.0, 0.0]),
  'an offset transition between rectangles': transition(30.0, [0.05, 0.02]),
  'a transition between circles': transition(30.0, [0.0, 0.0]),
  'a transition from a rectangle to a circle': transition(30.0, [0.0, 0.0]),
  'a transition from a circle to a rectangle': transition(45.0, [0.0, 0.0]),
  'a bend of a rectangle': bend(0.1, [1.0, 0.0, 0.0], false),
  'a bend of a rectangle without radius': bend(0.0, [0.0, -1.0, 0.0], true),
  'a bend of a circle': bend(0.2, [0.0, 1.0, 0.0], false),
  'faces extruded into a face set': f => {
    const b = new ShapeBuilder(f);
    const points = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
    return [graph(b.extrudeFaceSet(points, 2.0)), graph(b.extrudeFaceSet(points, 1.0, { extrusionVector: [0, 1, 0], offset: [1, 2, 3], startCap: false }))];
  },
  'a wall': walls,
  'two walls at a corner': walls,
  'a wall that joins another at its path': walls,
};

describeOrSkip('MEP shapes and wall regeneration as Python gives them', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it('has a call for each Python case', () => {
    expect(Object.keys(calls).sort()).toEqual(Object.keys(fixture.cases).sort());
  });

  it.each(Object.keys(fixture.cases))('%s', name => {
    const c = fixture.cases[name]!;
    using file = ifcopenshell.File.fromString(c.file);
    expect(difference(calls[name]!(file, c.ids), c.expected)).toBeNull();
  });
});
