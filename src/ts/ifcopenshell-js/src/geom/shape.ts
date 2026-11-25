// This file was generated with the assistance of an AI coding tool.
import { ifcopenshell } from '../init.js';
import type { Settings } from './settings.js';
import type { EntityInstance } from '../entity_instance.js';
import type { IfcOpenshellGeomFunctionItemEvaluator, IfcOpenshellGeomTaxonomyItem } from '@ifcopenshell/wasm/api';

/** Create one shape. Load the schema mapping and geometry kernel beforehand. */
export function createShape(settings: Settings, instance: EntityInstance, representation?: EntityInstance, geometryLibrary = 'opencascade') {
  return ifcopenshell.geom.createShape(settings, instance, representation ?? null, geometryLibrary);
}

/** The taxonomy item of an instance, such as the function item of an alignment curve or curve segment. */
export function mapShape(settings: Settings, instance: EntityInstance): IfcOpenshellGeomTaxonomyItem {
  return ifcopenshell.geom.mapShape(settings, instance);
}

/** An evaluator of a function item that mapShape gives. */
export function functionItemEvaluator(settings: Settings, item: IfcOpenshellGeomTaxonomyItem): IfcOpenshellGeomFunctionItemEvaluator {
  const evaluator = ifcopenshell.geom.createFunctionItemEvaluator(settings, item);
  if (!evaluator) throw new TypeError('The item is not a function item');
  return evaluator;
}

/** The first and last parameter (distance along) of a function item that mapShape gives. */
export function functionItemRange(item: IfcOpenshellGeomTaxonomyItem): [number, number] {
  return [ifcopenshell.geom.taxonomyFunctionItemStart(item), ifcopenshell.geom.taxonomyFunctionItemEnd(item)];
}

/** x, y and the direction angle at the distance s along a Helmert curve with the coefficients A0, A1 and A2. */
export function helmertCurvePoint(a0: number, a1: number, a2: number, s: number): [number, number, number] {
  const [x, y, angle] = ifcopenshell.geom.helmertCurvePoint(a0, a1, a2, s);
  return [x!, y!, angle!];
}
