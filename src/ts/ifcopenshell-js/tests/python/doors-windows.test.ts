// This file was generated with the assistance of an AI coding tool.

// Door and window representations, written by hand with arrays in TS. The expected graphs are those
// that Python ifcopenshell.api.geometry gives for the same calls on the same file
// (fixtures/doors-windows.json; each entity is its class and attributes, references are indices).

import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import * as ifcopenshell from 'ifcopenshell';
import * as geometry from 'ifcopenshell/api/geometry';
import { createInstance, describeOrSkip } from '../_helper.js';
import { difference, graph } from './_graph.js';

interface Case {
  api: 'door' | 'window';
  context: 'body' | 'plan' | 'annotation' | 'elevation';
  operation_type?: string;
  partition_type?: string;
  lining_properties?: Record<string, number>;
  panel_properties?: Record<string, number>[];
  expected: unknown[] | null;
}

const fixture = JSON.parse(readFileSync(new URL('./fixtures/doors-windows.json', import.meta.url), 'utf-8')) as { base: string; cases: Case[] };

const CONTEXTS = {
  body: ['Body', 'MODEL_VIEW'],
  elevation: ['Profile', 'ELEVATION_VIEW'],
  plan: ['Body', 'PLAN_VIEW'],
  annotation: ['Annotation', 'PLAN_VIEW'],
} as const;

describeOrSkip('door and window representations as Python gives them', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  it.each(fixture.cases.map(c => [`${c.api} ${c.operation_type ?? c.partition_type} ${c.context}${c.lining_properties && c.api === 'door' ? ' with lining properties' : ''}`, c] as const))(
    '%s',
    (_, c) => {
      using file = ifcopenshell.File.fromString(fixture.base);
      const [identifier, view] = CONTEXTS[c.context];
      const context = file
        .byType('IfcGeometricRepresentationSubContext')
        .find(sub => sub.get('ContextIdentifier') === identifier && sub.get('TargetView') === view)!;
      const representation =
        c.api === 'door'
          ? geometry.addDoorRepresentation(file, { context, operationType: c.operation_type, liningProperties: c.lining_properties })
          : geometry.addWindowRepresentation(file, {
              context,
              partitionType: c.partition_type,
              liningProperties: c.lining_properties,
              panelProperties: c.panel_properties?.map(p => ({ ...p })),
            });
      if (c.expected === null) {
        expect(representation).toBeNull();
        return;
      }
      expect(difference(graph(representation!), c.expected)).toBeNull();
    },
  );
});
