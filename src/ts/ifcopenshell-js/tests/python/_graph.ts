// This file was generated with the assistance of an AI coding tool.

// Compare TS results with the Python results of the fixtures: entities as graphs (each entity is its
// class and attributes, references are indices in the order of a depth-first walk), numbers within 1e-7.

import * as ifcopenshell from 'ifcopenshell';

type Entity = ifcopenshell.EntityInstance;

/** The entities reachable from `root` (or from each root), as the fixtures have them. */
export function graph(root: Entity | Entity[]): unknown[] {
  if (Array.isArray(root)) return root.map(r => graph(r));
  const order: unknown[] = [];
  const index = new Map<number, number>();
  const visit = (entity: Entity): number => {
    const id = entity.id();
    if (id && index.has(id)) return index.get(id)!;
    const position = order.length;
    if (id) index.set(id, position);
    order.push(null);
    order[position] = [entity.isA(), entity.attributes().map((_, i) => value(entity.get(i)))];
    return position;
  };
  const value = (v: unknown): unknown => {
    if (v instanceof ifcopenshell.EntityInstance) {
      if (!v.id()) return { type: v.isA(), value: value(v.wrappedValue) };
      return { ref: visit(v) };
    }
    if (Array.isArray(v)) return v.map(value);
    return v;
  };
  visit(root);
  return order;
}

/** Typed arrays as arrays, recursively, so that results compare with JSON. */
export function plain(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  if (Array.isArray(value)) return value.map(plain);
  if (value !== null && typeof value === 'object' && !(value instanceof ifcopenshell.EntityInstance)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

/** The first difference of a result and an expected value, numbers within 1e-7, or null. */
export function difference(actual: unknown, expected: unknown, path = ''): string | null {
  actual = plain(actual);
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Math.abs(actual - expected) <= 1e-7 ? null : `${path}: ${actual} != ${expected}`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return `${path}: ${JSON.stringify(actual)?.slice(0, 300)} != ${JSON.stringify(expected).slice(0, 300)}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const found = difference(actual[i], expected[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') return `${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`;
    for (const key of Object.keys(expected)) {
      const found = difference((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
      if (found) return found;
    }
    return null;
  }
  return actual === expected ? null : `${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`;
}
