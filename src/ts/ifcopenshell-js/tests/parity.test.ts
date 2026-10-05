/**
 * Binding API parity checks against BINDING-API-PARITY-SPEC.md §3–§4 / §5.
 */
import { beforeAll, expect, it } from 'vitest';
import { createInstance, describeOrSkip } from './_helper.js';
import ifcopenshell, {
  file as createFile,
  geom,
  guid,
  type IfcOpenShell,
} from '../src/index.js';

describeOrSkip('SWIG Python parity', () => {
  let shell: IfcOpenShell;

  beforeAll(async () => {
    shell = await createInstance();
    await shell.loadPlugin('schema', 'ifc4');
  });

  it('exposes the idiomatic JS public surface (§5)', () => {
    expect(ifcopenshell).toMatchObject({
      init: expect.any(Function),
      open: expect.any(Function),
      file: expect.any(Function),
      guid: expect.objectContaining({ new: expect.any(Function) }),
      geom: expect.objectContaining({
        settings: expect.any(Function),
        iterate: expect.any(Function),
        iterator: expect.any(Function),
        serializers: expect.objectContaining({
          obj: expect.any(Function),
          svg: expect.any(Function),
          ttl: expect.any(Function),
        }),
      }),
    });
    expect(geom.settings).toBe(ifcopenshell.geom.settings);
    expect(geom.iterate).toBe(ifcopenshell.geom.iterate);
    // Rejected primary names must not appear on the default export.
    expect('GeomSettings' in ifcopenshell).toBe(false);
    expect(typeof (ifcopenshell as { exportToBuffer?: unknown }).exportToBuffer).toBe('undefined');
  });

  it('runs the §4 script shape and assign_product core fragment (§3)', async () => {
    await using model = await createFile({ schema: 'IFC4', shell });

    const project = model.createEntity('IfcProject', {
      GlobalId: guid.new(),
      Name: 'Parity project',
    });
    expect(project.Name).toBe('Parity project');
    expect(model.schema).toMatch(/IFC4/i);

    const wall = model.createEntity('IfcWall', {
      GlobalId: guid.new(),
      Name: 'Demo',
    });
    expect(wall.isA('IfcWall')).toBe(true);
    expect(model.byId(wall.id())?.Name).toBe('Demo');
    expect(wall.getInfo().type).toBe('IfcWall');
    expect(wall.attributeName(0)).toBeTruthy();
    expect(wall.attributeType('Name')).toBeTruthy();

    const relating_product = wall;
    const related_object = model.createEntity('IfcTask', {
      GlobalId: guid.new(),
      Name: 'Task',
    });

    let referenced_by = null;
    if (relating_product.ReferencedBy?.length) {
      referenced_by = relating_product.ReferencedBy[0];
      const related_objects = [...referenced_by.RelatedObjects, related_object];
      referenced_by.RelatedObjects = related_objects;
    } else {
      referenced_by = model.createEntity('IfcRelAssignsToProduct', {
        GlobalId: guid.new(),
        RelatedObjects: [related_object],
        RelatingProduct: relating_product,
      });
    }

    expect(referenced_by.isA('IfcRelAssignsToProduct')).toBe(true);
    expect(referenced_by.RelatingProduct).toBe(relating_product);
    expect(related_object.HasAssignments[0]).toBe(referenced_by);

    const inverses = model.getInverse(related_object) as Set<typeof referenced_by>;
    expect(inverses.has(referenced_by)).toBe(true);
    expect(model.getTotalInverses(related_object)).toBeGreaterThan(0);

    const subgraph = model.traverse(wall, { maxLevels: 1 });
    try {
      expect(subgraph.some((entity) => entity.id() === wall.id())).toBe(true);
    } finally {
      subgraph.forEach((entity) => {
        if (entity !== wall && entity !== project && entity !== related_object && entity !== referenced_by) {
          entity.dispose();
        }
      });
    }

    expect(model.toString()).toContain('IFCWALL');
  });
});
