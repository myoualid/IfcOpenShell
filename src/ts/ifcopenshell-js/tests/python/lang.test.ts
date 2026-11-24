// This file was generated with the assistance of an AI coding tool.

import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import { Dict, IdentitySet } from '../../src/helpers/lang.js';
import { createInstance, describeOrSkip } from '../_helper.js';

describeOrSkip('sets and dicts of generated code', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it('keeps one member for each entity identity', () => {
    using file = new ifcopenshell.File('IFC4');
    const wall = file.create('IfcWall', { Name: 'Wall' });
    const slab = file.create('IfcSlab', { Name: 'Slab' });
    const set = new IdentitySet([wall, file.byId(wall.id())!, slab]);
    expect(set.size).toBe(2);
    expect(set.has(file.byId(slab.id())!)).toBe(true);
    expect(set.difference([file.byId(wall.id())!]).size).toBe(1);
    expect(set.intersection(new IdentitySet([file.byId(wall.id())!])).size).toBe(1);
    expect(set.union([file.byId(slab.id())!]).size).toBe(2);
    expect(set.isSubsetOf([slab, wall])).toBe(true);
    expect(set.delete(file.byId(wall.id())!)).toBe(true);
    expect([...set].map(e => e.id())).toEqual([slab.id()]);
  });

  it('compares other values by value', () => {
    const set = new IdentitySet<unknown>(['a', 'a', 1, 1, null]);
    expect(set.size).toBe(3);
    expect(new IdentitySet([1, 2]).difference(new Set([2])).has(1)).toBe(true);
  });

  it('keys dicts by entity identity', () => {
    using file = new ifcopenshell.File('IFC4');
    const wall = file.create('IfcWall', { Name: 'Wall' });
    const dict = new Dict<ifcopenshell.EntityInstance, number>();
    dict.set(wall, 1);
    dict.set(file.byId(wall.id())!, 2);
    expect(dict.size).toBe(1);
    expect(dict.get(file.byId(wall.id())!)).toBe(2);
  });
});
