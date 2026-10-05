import { beforeAll, expect, it } from 'vitest';
import { createInstance, describeOrSkip } from './_helper.js';
import {
  file as createFile,
  guid,
  IfcFile,
  IfcOpenShellError,
  open,
  type IfcOpenShell,
} from '../src/index.js';

describeOrSkip('IfcFile', () => {
  let shell: IfcOpenShell;

  beforeAll(async () => {
    shell = await createInstance();
    await shell.loadPlugin('schema', 'ifc4');
  });

  it('creates, queries, and serializes with SWIG-aligned names', async () => {
    await using model = await IfcFile.create(shell, 'IFC4');
    await using wall = model.createEntity('IfcWall', {
      GlobalId: guid.new(),
      Name: 'Demo',
    });

    expect(wall.isA()).toBe('IfcWall');
    expect(wall.isA('IfcWall')).toBe(true);
    expect(wall.Name).toBe('Demo');
    await using fetched = model.byId(wall.id());
    expect(fetched?.isA()).toBe('IfcWall');
    expect(fetched).toBe(wall);

    const walls = model.byType('IfcWall');
    try {
      expect(walls.map((entity) => entity.id())).toEqual([wall.id()]);
    } finally {
      walls.forEach((entity) => {
        if (entity !== wall) entity.dispose();
      });
    }
    expect(model.toString()).toContain('IFCWALL');
  });

  it('ports assign_product core graph operations', async () => {
    await using model = await IfcFile.create(shell, 'IFC4');
    const relating_product = model.createEntity('IfcWall', { GlobalId: guid.new(), Name: 'Product' });
    const related_object = model.createEntity('IfcTask', { GlobalId: guid.new(), Name: 'Task' });

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
    expect([...model.getInverse(related_object) as Set<typeof referenced_by>].some((entity) => entity === referenced_by)).toBe(true);
    const subgraph = model.traverse(referenced_by, { maxLevels: 1 });
    try {
      expect(subgraph.some((entity) => entity === relating_product)).toBe(true);
    } finally {
      subgraph.forEach((entity) => {
        if (entity !== referenced_by && entity !== relating_product && entity !== related_object) {
          entity.dispose();
        }
      });
    }
  });

  it('opens through the module-level public API', async () => {
    await using seeded = await createFile({ schema: 'IFC4', shell });
    seeded.createEntity('IfcProject', { GlobalId: guid.new(), Name: 'Demo' });
    const bytes = new TextEncoder().encode(seeded.toString());
    await using model = await open(bytes, 'model.ifc', { shell });
    const project = model.byType('IfcProject')[0];
    expect(project?.Name).toBe('Demo');
    expect(model.schema).toBeTruthy();
  });

  it('guards a disposed file handle', async () => {
    const file = await IfcFile.create(shell, 'IFC4');
    file.dispose();
    file.dispose();
    expect(() => file.raw).toThrow(IfcOpenShellError);
  });

  it('serializes IFC logical values as JSON', async () => {
    const text = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('x.ifc','2026-01-01T00:00:00',(),(),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROPERTYSINGLEVALUE('x',$,IFCLOGICAL(.U.),$);
ENDSEC;
END-ISO-10303-21;`;
    await using file = await IfcFile.open(shell, new TextEncoder().encode(text));
    await using property = file.byId(1);
    expect(JSON.parse(shell.raw.parse.getInfoJson(property!.raw, true))).toMatchObject({
      NominalValue: { type: 'IfcLogical', wrappedValue: 'UNKNOWN' },
    });
  });
});
