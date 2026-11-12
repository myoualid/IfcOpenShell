// This file was generated with the assistance of an AI coding tool.

// Translation rules of src/transpiler/ts.yaml that the recorded Python tests do not reach, checked on the
// generated code against values computed with Python. Needs `npm run generate` and `npm run build` first.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import { createInstance, describeOrSkip } from '../_helper.js';

const built = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/python');
const generated = existsSync(resolve(built, 'util/cost.js'));
const load = (module: string) => import(pathToFileURL(resolve(built, `${module}.js`)).href);

(generated ? describeOrSkip : describe.skip)('transpiled rules', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cost: any, editQto: any;
  let file: ifcopenshell.File;
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
    cost = await load('util/cost');
    editQto = await load('api/pset/edit_qto');
    file = new ifcopenshell.File('IFC4');
  });

  const money = (value: number) => file.create('IfcMonetaryMeasure', [value]);

  it('accepts whole numbers where a float check guards reading the value', () => {
    // isinstance(v, float) then `return v`: 85.0 is a float in Python and 85 in JS.
    expect(cost.getPrimitiveAppliedValue(85)).toBe(85);
    expect(cost.getPrimitiveAppliedValue(money(85))).toBe(85);
    expect(cost.getPrimitiveAppliedValue(money(1.2))).toBe(1.2);
  });

  it('keeps telling integers from floats where a float check only picks a branch', () => {
    // infer_property_type("Foo", 3) == "Count" and infer_property_type("Foo", 2.5) == "Length" in Python.
    expect(editQto.inferPropertyType('Foo', 3)).toBe('Count');
    expect(editQto.inferPropertyType('Foo', 2.5)).toBe('Length');
  });
});
