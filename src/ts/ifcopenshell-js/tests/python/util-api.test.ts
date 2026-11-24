// This file was generated with the assistance of an AI coding tool.

// Functional tests of code generated from ifcopenshell.util and ifcopenshell.api (src/transpiler).
// The expected results are those of the Python functions for the same calls.

import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import * as aggregate from 'ifcopenshell/api/aggregate';
import * as pset from 'ifcopenshell/api/pset';
import * as root from 'ifcopenshell/api/root';
import * as unitApi from 'ifcopenshell/api/unit';
import * as cost from 'ifcopenshell/util/cost';
import * as element from 'ifcopenshell/util/element';
import * as unit from 'ifcopenshell/util/unit';
import { createInstance, describeOrSkip } from '../_helper.js';

describeOrSkip('generated util and api', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it('creates rooted entities with a GlobalId and a name', () => {
    using file = new ifcopenshell.File('IFC4');
    const wall = root.createEntity(file, { ifcClass: 'IfcWall', name: 'Wall' });
    expect(wall.isA()).toBe('IfcWall');
    expect(wall.get('Name')).toBe('Wall');
    expect(wall.get('GlobalId')).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
  });

  it('aggregates elements and finds the aggregate', () => {
    using file = new ifcopenshell.File('IFC4');
    const building = root.createEntity(file, { ifcClass: 'IfcBuilding' });
    const storey = root.createEntity(file, { ifcClass: 'IfcBuildingStorey' });
    const relation = aggregate.assignObject(file, [storey], building)!;
    expect(relation.isA()).toBe('IfcRelAggregates');
    expect(element.getAggregate(storey)!.id()).toBe(building.id());
    expect(element.getAggregate(building)).toBeNull();
  });

  it('adds and edits a property set', () => {
    using file = new ifcopenshell.File('IFC4');
    const wall = root.createEntity(file, { ifcClass: 'IfcWall' });
    const properties = pset.addPset(file, wall, 'Pset_WallCommon');
    pset.editPset(file, properties, { properties: { IsExternal: true, Reference: 'W01' } });
    const psets = element.getPsets(wall);
    expect(psets.Pset_WallCommon).toMatchObject({ IsExternal: true, Reference: 'W01' });
    expect(psets.Pset_WallCommon.id).toBe(properties.id());
  });

  it('assigns default units and gives the length scale', () => {
    using file = new ifcopenshell.File('IFC4');
    root.createEntity(file, { ifcClass: 'IfcProject' });
    unitApi.assignUnit(file);
    // Python assigns millimetres by default.
    expect(unit.calculateUnitScale(file)).toBeCloseTo(0.001);
  });

  it('parses cost formulas with the Lark.js parser', () => {
    const parse = (formula: string) => new cost.CostValueUnserialiser().parse(formula);
    expect(parse('5000 * 1.19')).toEqual({
      Components: [{ AppliedValue: 5000 }, { AppliedValue: 1.19 }],
      ArithmeticOperator: 'MULTIPLY',
    });
    expect(parse('SUM(2 + 3)')).toEqual({
      Category: '*',
      Components: [{ AppliedValue: 2 }, { AppliedValue: 3 }],
      ArithmeticOperator: 'ADD',
    });
    expect(parse('10')).toEqual({ AppliedValue: 10 });
    expect(parse('MAT(2 * 3) + 4')).toEqual({
      Components: [
        { Category: 'MAT', Components: [{ AppliedValue: 2 }, { AppliedValue: 3 }], ArithmeticOperator: 'MULTIPLY' },
        { AppliedValue: 4 },
      ],
      ArithmeticOperator: 'ADD',
    });
  });
});
