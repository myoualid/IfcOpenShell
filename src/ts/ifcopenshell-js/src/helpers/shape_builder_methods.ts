// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.shape_builder ShapeBuilder methods that use numpy in Python, written by hand with TypedArrays.
// Each function is the method of the same name (ShapeBuilderPolyline is ShapeBuilder.polyline), with
// the builder as `this`. The generated ShapeBuilder class assigns them to its methods (see
// `hand_written` and `hand_written_method` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import type { ShapeBuilder } from '../util/shape_builder.js';
import { copyDeep } from '../util/element.js';
import { ifcSafeVectorType, npNormalized, npRotationMatrix, type VectorLike } from './shape_builder.js';

type Entity = EntityInstance;

function entity(owner: Entity, name: string): Entity {
  return owner.get(name) as Entity;
}

function add(a: VectorLike, b: VectorLike): number[] {
  return Array.from(a, (x, i) => x + b[i]!);
}

function cross(a: VectorLike, b: VectorLike): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

/** The product of a flat row-major n x n matrix and a vector of n values. */
function apply(matrix: VectorLike, v: VectorLike): Float64Array {
  const n = v.length;
  return Float64Array.from({ length: n }, (_, row) => {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += matrix[row * n + k]! * v[k]!;
    return sum;
  });
}

/**
 * An IfcIndexedPolyCurve (IfcPolyline in IFC2X3) through 2D or 3D points. `arcPoints` are the
 * indices of the points that are the middle of an arc.
 */
export function ShapeBuilderPolyline(
  this: ShapeBuilder,
  points: ArrayLike<VectorLike>,
  options: { closed?: boolean; positionOffset?: VectorLike | null; arcPoints?: ArrayLike<number> } = {},
): Entity {
  const { closed = false, positionOffset = null } = options;
  const arcPoints = Array.from(options.arcPoints ?? []);
  const file = this.file;
  if (arcPoints.length && file.schema() === 'IFC2X3') throw new Error('Arcs are not supported for IFC2X3.');

  const coords = Array.from(points, p => (positionOffset ? add(p, positionOffset) : Array.from(p, Number)));

  if (file.schema() === 'IFC2X3') {
    const ifcPoints = coords.map(p => file.create('IfcCartesianPoint', [p]));
    if (closed) ifcPoints.push(ifcPoints[0]!);
    return file.create('IfcPolyline', { Points: ifcPoints });
  }

  const dimensions = coords[0]!.length;
  if (dimensions !== 2 && dimensions !== 3) throw new Error(`Point has unexpected number of dimensions - ${dimensions}.`);
  const ifcPoints = file.create(`IfcCartesianPointList${dimensions}D`, [coords]);
  if (!closed && !arcPoints.length) return file.create('IfcIndexedPolyCurve', { Points: ifcPoints });

  // Closed curves and arcs need segments (IFC indices start at 1).
  const segments: number[][] = [];
  let current = 0;
  let closedByArc = false;
  while (current < coords.length - 1) {
    const index = current + 1;
    if (arcPoints.includes(current + 1)) {
      if (index + 1 < coords.length) {
        segments.push([index, index + 1, index + 2]);
      } else {
        segments.push([index, index + 1, 1]);
        closedByArc = true;
      }
      current += 2;
    } else {
      segments.push([index, index + 1]);
      current += 1;
    }
  }
  if (closed && !closedByArc) segments.push([coords.length, 1]);

  // Neighbouring line segments merge into one IfcLineIndex.
  const ifcSegments: Entity[] = [];
  let line: number[] = [];
  segments.forEach((segment, i) => {
    if (segment.length === 2) line.push(...(line.length ? segment.slice(1) : segment));
    if (line.length && (segment.length === 3 || i === segments.length - 1)) {
      ifcSegments.push(file.create('IfcLineIndex', [line]));
      line = [];
    }
    if (segment.length === 3) ifcSegments.push(file.create('IfcArcIndex', [segment]));
  });
  return file.create('IfcIndexedPolyCurve', { Points: ifcPoints, Segments: ifcSegments });
}

/** The four corners of a rectangle of `size` (2D or 3D, with two non-zero values) at `position`. */
export function ShapeBuilderGetRectangleCoords(options: { size?: VectorLike; position?: VectorLike | null } = {}): Float64Array[] {
  const { size = [1, 1], position = null } = options;
  const points = Array.from({ length: 4 }, () => (position ? Float64Array.from(position) : new Float64Array(size.length)));
  const nonEmpty = Array.from(size, (_, i) => i).filter(i => size[i] !== 0);
  points[1]![nonEmpty[0]!] += size[nonEmpty[0]!]!;
  for (let i = 0; i < size.length; i++) points[2]![i] += size[i]!;
  points[3]![nonEmpty[1]!] += size[nonEmpty[1]!]!;
  return points;
}

/** An IfcPlane through `location` with the normal `normal`. */
export function ShapeBuilderPlane(this: ShapeBuilder, options: { location?: VectorLike; normal?: VectorLike } = {}): Entity {
  const { location = [0, 0, 0], normal = [0, 0, 1] } = options;
  const isZ = [0, 0, 1].every((target, i) => Math.abs(Math.round(normal[i]! * 100) / 100 - target) <= 1e-8 + 1e-5 * target);
  const xAxis = npNormalized(cross(normal, isZ ? [0, 1, 0] : [0, 0, 1]));
  return this.file.create('IfcPlane', [this.createAxis2Placement3d({ position: location, zAxis: normal, xAxis })]);
}

/** An arc between two 2D points, as an IfcIndexedPolyCurve. */
export function ShapeBuilderCurveBetweenTwoPoints(this: ShapeBuilder, points: [VectorLike, VectorLike]): Entity {
  const diff = Array.from(points[1], (x, i) => x - points[0][i]!);
  let largest = 0;
  diff.forEach((d, i) => {
    if (Math.abs(d) > Math.abs(diff[largest]!)) largest = i;
  });
  // The offset of the middle point is on one axis only; on two, the arc would be a straight line.
  const offset = diff.map((d, i) => (i === largest ? 0.01 * Math.sign(d) : 0));
  const coords = [points[0], add(points[0], offset), points[1]].map(p => ifcSafeVectorType(p));
  const segment = this.file.create('IfcArcIndex', [[1, 2, 3]]);
  const ifcPoints = this.file.create('IfcCartesianPointList2D', [coords]);
  return this.file.create('IfcIndexedPolyCurve', { Points: ifcPoints, Segments: [segment] });
}

/** Moves curves, extrusions, face sets or representations by `translation`; with `createCopy`, moves copies. */
export function ShapeBuilderTranslate(
  this: ShapeBuilder,
  curveOrItem: Entity | Entity[],
  translation: VectorLike,
  options: { createCopy?: boolean } = {},
): Entity | Entity[] {
  const multiple = Array.isArray(curveOrItem);
  const processed: Entity[] = [];
  for (let c of multiple ? curveOrItem : [curveOrItem]) {
    if (options.createCopy) c = copyDeep(this.file, c);
    if (c.isA() === 'IfcIndexedPolyCurve' || c.isA() === 'IfcPolyline') {
      this.setPolylineCoords(c, ShapeBuilderGetPolylineCoords.call(this, c).map(p => add(p, translation)));
    } else if (c.isA('IfcCircle') || c.isA('IfcExtrudedAreaSolid') || c.isA('IfcEllipse')) {
      const location = entity(entity(c, 'Position'), 'Location');
      location.set('Coordinates', add(location.get('Coordinates') as number[], translation));
    } else if (c.isA('IfcTessellatedFaceSet')) {
      const list = entity(c, 'Coordinates');
      list.set('CoordList', (list.get('CoordList') as number[][]).map(p => add(p, translation)));
    } else if (c.isA('IfcShapeRepresentation')) {
      for (const item of c.get('Items') as Entity[]) ShapeBuilderTranslate.call(this, item, translation);
    } else if (c.isA('IfcTrimmedCurve')) {
      for (const name of ['Trim1', 'Trim2']) {
        const point = (c.get(name) as Entity[])[0]!;
        point.set('Coordinates', add(point.get('Coordinates') as number[], translation));
      }
      ShapeBuilderTranslate.call(this, entity(c, 'BasisCurve'), translation);
    } else {
      throw new Error(`${c} is not supported for translate() method.`);
    }
    processed.push(c);
  }
  return multiple ? processed : processed[0]!;
}

/** A 2D point rotated by `angle` degrees about `pivotPoint`, clockwise unless `counterClockwise`. */
export function ShapeBuilderRotate2dPoint(
  this: ShapeBuilder,
  point2d: VectorLike,
  options: { angle?: number; pivotPoint?: VectorLike; counterClockwise?: boolean } = {},
): Float64Array {
  const { angle = 90, pivotPoint = [0, 0], counterClockwise = false } = options;
  const radians = ((angle * Math.PI) / 180) * (counterClockwise ? 1 : -1);
  const rotated = apply(npRotationMatrix(radians, 2), [point2d[0]! - pivotPoint[0]!, point2d[1]! - pivotPoint[1]!]);
  return Float64Array.from(rotated, (x, i) => x + pivotPoint[i]!);
}

/** A 2D point mirrored about `mirrorPoint` on the axes whose `mirrorAxes` value is positive. */
export function ShapeBuilderMirror2dPoint(
  this: ShapeBuilder,
  point2d: VectorLike,
  options: { mirrorAxes?: VectorLike; mirrorPoint?: VectorLike } = {},
): Float64Array {
  const { mirrorAxes = [1, 1], mirrorPoint = [0, 0] } = options;
  return Float64Array.from(point2d, (x, i) => (x - mirrorPoint[i]!) * (mirrorAxes[i]! > 0 ? -1 : 1) + mirrorPoint[i]!);
}

/** An IfcAxis2Placement3D from a 4x4 row-major matrix (the identity when left out). */
export function ShapeBuilderCreateAxis2Placement3dFromMatrix(this: ShapeBuilder, options: { matrix?: VectorLike | null } = {}): Entity {
  const m = options.matrix ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const column = (j: number) => [m[j]!, m[4 + j]!, m[8 + j]!];
  return this.createAxis2Placement3d({ position: column(3), zAxis: column(2), xAxis: column(0) });
}

/**
 * An IfcExtrudedAreaSolid of a profile (or of a curve, made into a profile) along `extrusionVector`
 * (in the placement axes) by `magnitude`. With `positionYAxis`, the Z axis is X × Y.
 */
export function ShapeBuilderExtrude(
  this: ShapeBuilder,
  profileOrCurve: Entity,
  options: {
    magnitude?: number;
    position?: VectorLike;
    extrusionVector?: VectorLike;
    positionZAxis?: VectorLike;
    positionXAxis?: VectorLike;
    positionYAxis?: VectorLike | null;
  } = {},
): Entity {
  const { magnitude = 1, position = [0, 0, 0], extrusionVector = [0, 0, 1], positionXAxis = [1, 0, 0], positionYAxis = null } = options;
  let { positionZAxis = [0, 0, 1] } = options;
  if (!magnitude) {
    throw new Error(
      'Extrusion magnitude must be greater than 0 to be valid.\n' +
        'Ref: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcPositiveLengthMeasure.htm#8.11.2.71.3-Formal-representation',
    );
  }
  const profile = profileOrCurve.isA('IfcProfileDef') ? profileOrCurve : this.profile(profileOrCurve);
  if (positionYAxis && positionYAxis.length) positionZAxis = cross(positionXAxis, positionYAxis);
  return this.file.create('IfcExtrudedAreaSolid', {
    SweptArea: profile,
    Position: this.createAxis2Placement3d({ position, zAxis: positionZAxis, xAxis: positionXAxis }),
    ExtrudedDirection: this.file.create('IfcDirection', [ifcSafeVectorType(extrusionVector)]),
    Depth: magnitude,
  });
}

/** The points of an IfcIndexedPolyCurve or IfcPolyline. */
export function ShapeBuilderGetPolylineCoords(this: ShapeBuilder, polyline: Entity): Float64Array[] {
  if (polyline.isA('IfcIndexedPolyCurve')) {
    return (entity(polyline, 'Points').get('CoordList') as number[][]).map(p => Float64Array.from(p));
  }
  if (polyline.isA('IfcPolyline')) {
    return (polyline.get('Points') as Entity[]).map(p => Float64Array.from(p.get('Coordinates') as number[]));
  }
  throw new Error(`Unsupported polyline type: ${polyline.isA()}`);
}

/**
 * Extrusion arguments (as `extrudeKwargs` gives them) with their X and Z axes rotated by `angle` radians
 * about Z. Python also takes counter_clockwise, but does not use it.
 */
export function ShapeBuilderRotateExtrusionKwargsByZ(
  this: ShapeBuilder,
  kwargs: Record<string, VectorLike>,
  angle: number,
): Record<string, VectorLike> {
  const rotation = npRotationMatrix(-angle, 3, { axis: 'Z' });
  return {
    ...kwargs,
    position_x_axis: apply(rotation, kwargs.position_x_axis!),
    position_z_axis: apply(rotation, kwargs.position_z_axis!),
  };
}
