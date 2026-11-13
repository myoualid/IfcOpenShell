// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// `ifcopenshell.geom`, and the `ifcopenshell_wrapper` functions next to it, on top of
// `ifcopenshell/geom`. Results have the shape Python gives them: properties rather than methods, and
// a shape rather than an element for anything but a product. The caller loads the mapping and kernel
// plugins, as for `ifcopenshell/geom`. Hand-written, unlike the transpiled util/ and api/ next to it.

import { Settings as CoreSettings, createShape as coreCreateShape } from '../geom/index.js';
import type { SettingInput } from '../geom/index.js';
import { ifcopenshell } from '../init.js';
import type { EntityInstance } from '../entity_instance.js';
import { calculateUnitScale } from '../util/unit.js';

export const CURVES = 0;
export const SURFACES_AND_SOLIDS = 1;
export const CURVES_SURFACES_AND_SOLIDS = 2;

/** Setting names as Python accepts them: `COMPUTE_CURVATURE` is `compute-curvature`. */
const settingName = (name: string) => name.toLowerCase().replace(/_/g, '-');

export class Settings extends CoreSettings {
  override set(name: string, value: SettingInput): void {
    super.set(settingName(name), value);
  }

  override get(name: string): SettingInput {
    return super.get(settingName(name));
  }
}

type NativeGeometry = NonNullable<ReturnType<NonNullable<ReturnType<NonNullable<ReturnType<typeof coreCreateShape>>['asTriangulationElement']>>['geometry']>>;

/** `ifcopenshell_wrapper.triangulation`; `owner` keeps the element alive, as in Python. */
class Triangulation {
  constructor(private readonly native: NativeGeometry, readonly owner: unknown) {}
  get verts() { return this.native.verts(); }
  get faces() { return this.native.faces(); }
  get edges() { return this.native.edges(); }
  get normals() { return this.native.normals(); }
  get materials() { return this.native.materials(); }
  get verts_buffer() { return this.native.vertsBuffer(); }
  get faces_buffer() { return this.native.facesBuffer(); }
  get edges_buffer() { return this.native.edgesBuffer(); }
  get normals_buffer() { return this.native.normalsBuffer(); }
}

// Column-major 4x4 matrices, as `ifcopenshell_wrapper.transformation.matrix`.
type Vector = [number, number, number];

const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalized = (a: Vector): Vector => {
  const length = Math.sqrt(dot(a, a));
  return [a[0] / length, a[1] / length, a[2] / length];
};
const vector = (values: readonly number[] | null | undefined, fallback: Vector): Vector => (
  values ? [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0] : fallback
);

function multiply(a: number[], b: number[]): number[] {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) result[column * 4 + row]! += a[k * 4 + row]! * b[column * 4 + k]!;
    }
  }
  return result;
}

function axis2Placement(placement: any): number[] {
  const z = placement.isA('IfcAxis2Placement3D') ? normalized(vector(placement.Axis?.DirectionRatios, [0, 0, 1])) : [0, 0, 1] as Vector;
  const reference = vector(placement.RefDirection?.DirectionRatios, [1, 0, 0]);
  const along = dot(reference, z);
  const x = normalized([reference[0] - along * z[0], reference[1] - along * z[1], reference[2] - along * z[2]]);
  return [...x, 0, ...cross(z, x), 0, ...z, 0, ...vector(placement.Location.Coordinates, [0, 0, 0]), 1];
}

/** The kernel's mapping of a placement is not readable from JS, so the common placements are composed here. */
function placementMatrix(placement: any): number[] {
  if (placement.isA('IfcAxis2Placement3D') || placement.isA('IfcAxis2Placement2D')) return axis2Placement(placement);
  if (placement.isA('IfcLocalPlacement')) {
    const relative = placementMatrix(placement.RelativePlacement);
    return placement.PlacementRelTo ? multiply(placementMatrix(placement.PlacementRelTo), relative) : relative;
  }
  throw new Error(`create_shape: ${placement.isA()} needs the geometry kernel's placement mapping, which the JS bindings do not expose`);
}

function transformation(settings: Settings, placement: any): { matrix: number[] } {
  const matrix = placementMatrix(placement);
  if (settings.get('convert-back-units') === false) {
    const scale = calculateUnitScale(placement.file());
    for (const index of [12, 13, 14]) matrix[index]! *= scale;
  }
  return { matrix };
}

/** `ifcopenshell.geom.create_shape` for triangulated output. */
export function createShape(settings: Settings, instance: EntityInstance, representation?: EntityInstance, geometryLibrary = 'opencascade'): any {
  if (instance.isA('IfcPlacement') || instance.isA('IfcObjectPlacement')) return transformation(settings, instance);
  const element = coreCreateShape(settings, instance, representation, geometryLibrary);
  const triangulation = element?.asTriangulationElement();
  if (!triangulation) throw new Error('create_shape: Failed to process shape');
  const geometry = new Triangulation(triangulation.geometry(), element);
  return instance.isA('IfcProduct') ? { geometry } : geometry;
}

/** `ifcopenshell_wrapper.map_shape`. Only function items can be read from JS. */
class FunctionItem {
  constructor(readonly item: any) {}
  start(): number { return ifcopenshell.geom.taxonomyFunctionItemStart(this.item); }
  end(): number { return ifcopenshell.geom.taxonomyFunctionItemEnd(this.item); }
}

export function mapShape(settings: Settings, instance: EntityInstance): FunctionItem {
  return new FunctionItem(ifcopenshell.geom.mapShape(settings, instance));
}

/** `ifcopenshell_wrapper.function_item_evaluator`: `evaluate` gives the rows of a 4x4 matrix. */
class FunctionItemEvaluator {
  constructor(private readonly native: any) {}
  evaluate(u: number): number[][] {
    const values = this.native.evaluateAt(u);
    return [values.slice(0, 4), values.slice(4, 8), values.slice(8, 12), values.slice(12, 16)];
  }
}

export function functionItemEvaluator(settings: Settings, item: FunctionItem): FunctionItemEvaluator {
  return new FunctionItemEvaluator(ifcopenshell.geom.createFunctionItemEvaluator(settings, item.item));
}
