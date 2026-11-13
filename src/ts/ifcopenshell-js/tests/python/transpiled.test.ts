// This file was generated with the assistance of an AI coding tool.

// Generated ifcopenshell/api and ifcopenshell/util calls that used to throw or misbehave, checked
// against what Python returns for the same calls (values noted inline, or the fixture written by
// Python). Imported from dist/python, so `npm run generate` and `npm run build` come first.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import * as api from '../../dist/python/api/index.js';
import * as util from '../../dist/python/util/index.js';
import { createInstance, describeOrSkip } from '../_helper.js';

const here = dirname(fileURLToPath(import.meta.url));

function newModel() {
  const file = api.project.createFile();
  api.root.createEntity(file, { ifcClass: 'IfcProject' });
  api.unit.assignUnit(file, { units: [api.unit.addSiUnit(file, { unitType: 'LENGTHUNIT' })] });
  const model = api.context.addContext(file, { contextType: 'Model' });
  const body = api.context.addContext(file, { contextType: 'Model', contextIdentifier: 'Body', targetView: 'MODEL_VIEW', parent: model });
  return { file, body };
}

const rows = (matrix: { tolist(): number[][] }) => matrix.tolist().map(row => row.map(v => Math.round(v * 1e9) / 1e9 + 0));

describeOrSkip('transpiled api and util', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it('aggregates every api package and util module', () => {
    expect(typeof api.root.createEntity).toBe('function');
    expect(typeof api.geometry.editObjectPlacement).toBe('function');
    expect(typeof util.placement.getPlacement).toBe('function');
    expect(typeof util.shape_builder.ShapeBuilder).toBe('function');
    // The hand-written helpers of ifcopenshell/util are still there.
    expect(typeof util.hashColor).toBe('function');
  });

  it('composes placements without the geometry kernel (util.placement.get_placement)', () => {
    const { file } = newModel();
    const parent = file.create('IfcLocalPlacement', { RelativePlacement: file.create('IfcAxis2Placement3D', [file.create('IfcCartesianPoint', [[1, 2, 3]])]) });
    const child = file.create('IfcLocalPlacement', [parent, file.create('IfcAxis2Placement3D', [
      file.create('IfcCartesianPoint', [[10, 0, 0]]), file.create('IfcDirection', [[0, 0, 1]]), file.create('IfcDirection', [[0, 1, 0]]),
    ])]);
    expect(rows(util.placement.getPlacement({ placement: child }))).toEqual([[0, -1, 0, 11], [1, 0, 0, 2], [0, 0, 1, 3], [0, 0, 0, 1]]);
    // As the kernel: the X axis of an IfcAxis1Placement along -X (mapping/IfcAxis1Placement.cpp).
    const axis1 = file.create('IfcAxis1Placement', [file.create('IfcCartesianPoint', [[0, 0, 0]]), file.create('IfcDirection', [[-1, 0, 0]])]);
    expect(rows(util.placement.getPlacement({ placement: axis1 }))).toEqual([[0, 0, -1, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]]);
  });

  it('places, contains and voids products that already have a placement', () => {
    const { file } = newModel();
    const storey = api.root.createEntity(file, { ifcClass: 'IfcBuildingStorey' });
    api.geometry.editObjectPlacement(file, storey, { matrix: util.placement.a2p([0, 0, 3], [0, 0, 1], [1, 0, 0]) });
    expect(util.placement.getStoreyElevation(storey)).toBe(3);
    const wall = api.root.createEntity(file, { ifcClass: 'IfcWall' });
    api.geometry.editObjectPlacement(file, wall, { matrix: util.placement.a2p([5, 0, 0], [0, 0, 1], [0, 1, 0]) });
    api.spatial.assignContainer(file, [wall], storey);
    // assign_container keeps the wall where it was, now relative to the storey.
    expect(wall.ObjectPlacement.PlacementRelTo).toBe(storey.ObjectPlacement);
    expect(rows(util.placement.getPlacement({ placement: wall.ObjectPlacement }))).toEqual([[0, -1, 0, 5], [1, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]);
    const opening = api.root.createEntity(file, { ifcClass: 'IfcOpeningElement' });
    api.geometry.editObjectPlacement(file, opening, { matrix: util.placement.a2p([6, 0, 1], [0, 0, 1], [1, 0, 0]) });
    expect(api.feature.addFeature(file, opening, wall).isA()).toBe('IfcRelVoidsElement');
  });

  it('writes keyword attributes next to positional ones (create_entity(cls, guid, Name=...))', () => {
    const { file } = newModel();
    const [a, b] = ['IfcWall', 'IfcWall'].map(ifcClass => api.root.createEntity(file, { ifcClass }));
    const rel = api.geometry.connectPath(file, a!, b!, { relatingConnection: 'ATEND', relatedConnection: 'ATSTART' });
    expect([rel.RelatingElement, rel.RelatedElement, rel.RelatingConnectionType, rel.RelatedConnectionType]).toEqual([a, b, 'ATEND', 'ATSTART']);
    const placement = new util.shape_builder.ShapeBuilder(file).createAxis2Placement3d({ position: [1, 2, 3] });
    expect(placement.Axis.DirectionRatios).toEqual([0, 0, 1]);
    expect(placement.RefDirection.DirectionRatios).toEqual([1, 0, 0]);
  });

  it('builds door, window and wall geometry as Python does (ShapeBuilder)', () => {
    const { file, body } = newModel();
    api.geometry.addDoorRepresentation(file, { context: body });
    api.geometry.addWindowRepresentation(file, { context: body });
    const wall = api.root.createEntity(file, { ifcClass: 'IfcWall' });
    api.geometry.create2ptWall(file, wall, body, [0, 0], [4, 1], 0.1, 3, 0.2);
    api.geometry.editObjectPlacement(file, wall, { matrix: util.placement.a2p([1, 2, 3], [0, 0, 1], [0.6, 0.8, 0]) });
    const normalise = (text: string) => text.split('\n').filter(line => line.startsWith('#'))
      .map(line => line.replace(/'[0-9A-Za-z_$]{22}'/g, "'G'").replace(/(\d+\.\d{6})\d*/g, '$1').replace(/-0\./g, '0.'));
    const expected = readFileSync(resolve(here, 'fixtures/geometry-representations.txt'), 'utf8');
    expect(normalise(file.toString())).toEqual(normalise(expected));
  });

  it('adds mesh representations and resets the WCS', () => {
    const { file, body } = newModel();
    expect(api.geometry.addMeshRepresentation(file, body, [[[0, 0, 0], [1, 0, 0], [0, 1, 0]]], { faces: [[[0, 1, 2]]] }).RepresentationType).toBe('Tessellation');
    api.georeference.addGeoreferencing(file);
    api.georeference.editWcs(file, { x: 1, y: 2, z: 3, rotation: 30 });
    const c = Math.cos(Math.PI / 6);
    expect(rows(util.geolocation.getWcs(file))).toEqual(rows({ tolist: () => [[c, -0.5, 0, 1], [0.5, c, 0, 2], [0, 0, 1, 3], [0, 0, 0, 1]] }));
  });

  it('reassigns the class of an element with a property set', () => {
    const { file } = newModel();
    const beam = api.root.createEntity(file, { ifcClass: 'IfcBeam' });
    api.pset.editPset(file, api.pset.addPset(file, beam, 'Pset_BeamCommon'), { properties: { Span: 3.0 } });
    const column = api.root.reassignClass(file, beam, { ifcClass: 'IfcColumn' });
    expect(column.isA()).toBe('IfcColumn');
    expect(util.element.getPset(column, 'Pset_BeamCommon', { prop: 'Span' })).toBe(3);
  });

  it('reads schema, pset template and type data', () => {
    const entity = ifcopenshell.schemaByName('IFC4').declarationByName('IfcWall').asEntity()!;
    expect(entity.attributes().concat().length).toBeGreaterThan(0);
    const attribute = (name: string) => (entity as any).allAttributes().find((a: any) => a.name() === name);
    expect(['GlobalId', 'OwnerHistory', 'PredefinedType'].map(name => util.attribute.getPrimitiveType(attribute(name)))).toEqual(['string', 'entity', 'enum']);
    // Python: 13 templates for IfcWall, 1 of them a quantity set, 12 property sets.
    const templates = util.pset.getTemplate('IFC4');
    expect([{}, { qtoOnly: true }, { psetOnly: true }].map(options => templates.getApplicable({ ifcClass: 'IfcWall', ...options }).length)).toEqual([13, 1, 12]);
    expect(util.type.getApplicableEntities('IfcDoorType', { schema: 'IFC4' }).map(String)).toEqual([
      "ApplicableOccurrence(ifc_class='IfcDoor', predefined_type=None)",
      "ApplicableOccurrence(ifc_class='IfcDoorStandardCase', predefined_type=None)",
    ]);
  });

  it('computes costs, cost formulas and resource quantities', () => {
    const { file } = newModel();
    expect(util.cost.getPrimitiveAppliedValue(file.create('IfcMonetaryMeasure', [42]))).toBe(42);
    const schedule = api.cost.addCostSchedule(file);
    const value = api.cost.addCostValue(file, api.cost.addCostItem(file, { costSchedule: schedule }));
    api.cost.editCostValueFormula(file, value, '5000 * 1.19');
    // Python: 5000.0*1.19 MULTIPLY [5000.0, 1.19]
    expect([util.cost.serialiseCostValue(value), value.ArithmeticOperator, value.Components.map((c: any) => c.AppliedValue.wrappedValue)])
      .toEqual(['5000*1.19', 'MULTIPLY', [5000, 1.19]]);
    const resource = api.resource.addResource(file, { ifcClass: 'IfcLaborResource' });
    resource.Usage = file.create('IfcResourceTime', { ScheduleWork: 'PT8H' });
    expect(util.resource.getQuantity(resource)).toBe(8);
  });
});
