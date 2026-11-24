// This file was generated with the assistance of an AI coding tool.

// util.shape, written by hand with TypedArrays. The expected values are those that Python
// ifcopenshell.util.shape gives for the same 2 x 3 x 4 box.

import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import * as geom from 'ifcopenshell/geom';
import * as shape from 'ifcopenshell/util/shape';
import { createInstance, describeOrSkip } from '../_helper.js';

const BOX = `ISO-10303-21;
HEADER;FILE_DESCRIPTION((''),'2;1');FILE_NAME('','',(),(),'','','');FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#2=IFCAXIS2PLACEMENT3D(#1,$,$);
#3=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,3.);
#4=IFCDIRECTION((0.,0.,1.));
#5=IFCEXTRUDEDAREASOLID(#3,#2,#4,4.);
#6=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#2,$);
#7=IFCSHAPEREPRESENTATION(#6,'Body','SweptSolid',(#5));
#8=IFCPRODUCTDEFINITIONSHAPE($,$,(#7));
#9=IFCLOCALPLACEMENT($,#2);
#10=IFCBUILDINGELEMENTPROXY('0YvctVUKr0kugbFTf53O9L',$,'Box',$,$,#9,#8,$,.NOTDEFINED.);
ENDSEC;END-ISO-10303-21;`;

describeOrSkip('util.shape with TypedArrays', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
    await runtime.loadPlugin('mapping', 'ifc4');
    await runtime.loadPlugin('kernel', 'opencascade');
  });

  it('measures a box as Python does', () => {
    using model = ifcopenshell.File.fromString(BOX);
    const settings = new geom.Settings();
    settings.set('weld-vertices', false);
    const geometry = geom.createShape(settings, model.byId(10)!)!.asTriangulationElement()!.geometry();
    expect(shape.getVertices(geometry).length).toBe(24 * 3);
    expect(shape.getVertices(geometry, { is2d: true }).length).toBe(24 * 2);
    expect(shape.getFaces(geometry).length).toBe(12 * 3);
    expect(shape.getArea(geometry)).toBeCloseTo(52, 9);
    expect(shape.getVolume(geometry)).toBeCloseTo(24, 9);
    expect(shape.getSideArea(geometry)).toBeCloseTo(8, 9);
    expect(shape.getSideArea(geometry, { axis: 'X' })).toBeCloseTo(12, 9);
    expect(shape.getSideArea(geometry, { axis: 'Z' })).toBeCloseTo(6, 9);
    expect(shape.getSideArea(geometry, { direction: [1, 1, 0], angle: 45 })).toBe(0);
    expect(shape.getMaxSideArea(geometry)).toBeCloseTo(12, 9);
    expect(shape.getOuterSurfaceArea(geometry)).toBeCloseTo(40, 9);
    expect(shape.getFootprintPerimeter(geometry)).toBeCloseTo(10, 9);
    expect(shape.getTotalEdgeLength(geometry)).toBeCloseTo(72, 9);
  });
});
