// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.shape_builder ShapeBuilder methods that use numpy in Python, written by hand with TypedArrays.
// Each function is the method of the same name (ShapeBuilderPolyline is ShapeBuilder.polyline), with
// the builder as `this`. The generated ShapeBuilder class assigns them to its methods (see
// `hand_written` and `hand_written_method` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import { copyDeep, getMaterial } from '../util/element.js';
import { getContext } from '../util/representation.js';
import { isX, type ShapeBuilder } from '../util/shape_builder.js';
import { calculateUnitScale } from '../util/unit.js';
import { ifcSafeVectorType, npNormalized, npRotationMatrix, npRoundToPrecision, npTo3d, type VectorLike } from './shape_builder.js';
import { getPlacement } from './placement.js';

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

/**
 * The points of an ellipse at the ends of its axes, chosen by `trimPointsMask` (0: +X, 1: +Y, 2: -X,
 * 3: -Y), moved by `positionOffset`.
 */
export function ShapeBuilderGetTrimPointsFromMask(
  this: ShapeBuilder,
  xAxisRadius: number,
  yAxisRadius: number,
  trimPointsMask: ArrayLike<number>,
  options: { positionOffset?: VectorLike | null } = {},
): Float64Array[] {
  const points = [[xAxisRadius, 0], [0, yAxisRadius], [-xAxisRadius, 0], [0, -yAxisRadius]];
  const offset = options.positionOffset ?? [0, 0];
  return Array.from(trimPointsMask, i => Float64Array.from(points[i]!, (value, axis) => value + offset[axis]!));
}

/** The inverse of a flat row-major 3x3 matrix. */
function inverse3(m: VectorLike): Float64Array {
  const [a, b, c, d, e, f, g, h, i] = Array.from({ length: 9 }, (_, k) => m[k]!) as [number, number, number, number, number, number, number, number, number];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (det === 0) throw new Error('Singular matrix');
  return Float64Array.from([e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d], v => v / det);
}

/** The 3x3 rotation part of a flat row-major 4x4 matrix. */
function rotation3(m: VectorLike): Float64Array {
  return Float64Array.from([m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!]);
}

/**
 * Mirrors curves (polylines, circles, ellipses, trimmed curves) and extrusions in place, or copies
 * with `createCopy`, by the axes `mirrorAxes` (1: keep, 0 or -1 per axis as in mirror2dPoint) about
 * `mirrorPoint`. Several axes give one result for each. `placementMatrix` (3x3, row-major) gives the
 * placement of the coordinates of a polyline.
 */
export function ShapeBuilderMirror(
  this: ShapeBuilder,
  curveOrItem: Entity | Entity[],
  options: { mirrorAxes?: VectorLike | VectorLike[]; mirrorPoint?: VectorLike; createCopy?: boolean; placementMatrix?: VectorLike | null } = {},
): Entity | Entity[] {
  const { mirrorAxes = [1.0, 1.0], mirrorPoint = [0.0, 0.0], createCopy = false, placementMatrix = null } = options;
  const multipleObjects = Array.isArray(curveOrItem);
  const items = multipleObjects ? curveOrItem : [curveOrItem];
  const multipleTransformations = typeof mirrorAxes[0] !== 'number';
  const axesList = (multipleTransformations ? Array.from(mirrorAxes as VectorLike[]) : [mirrorAxes as VectorLike]);
  const processed: Entity[] = [];
  for (const item of items) {
    for (const axes of axesList) {
      const c = createCopy ? (copyDeep(this.file, item) as Entity) : item;
      if (['IfcIndexedPolyCurve', 'IfcPolyline'].includes(c.isA())) {
        const inverse = placementMatrix ? inverse3(placementMatrix) : null;
        const coords = this.getPolylineCoords(c).map(co => {
          if (!placementMatrix || !inverse) return this.mirror2dPoint(co, { mirrorAxes: axes, mirrorPoint });
          const base = apply(placementMatrix, npTo3d(co));
          const mirrored = this.mirror2dPoint(base.subarray(0, 2), { mirrorAxes: axes, mirrorPoint });
          return apply(inverse, npTo3d(mirrored, { z: base[2]! })).subarray(0, 2);
        });
        this.setPolylineCoords(c, coords);
      } else if (c.isA('IfcCircle') || c.isA('IfcEllipse')) {
        const location = entity(entity(c, 'Position'), 'Location');
        location.set('Coordinates', ifcSafeVectorType(this.mirror2dPoint(location.get('Coordinates') as number[], { mirrorAxes: axes, mirrorPoint })));
      } else if (c.isA('IfcExtrudedAreaSolid')) {
        const position = entity(c, 'Position');
        const placement = rotation3(getPlacement({ placement: position }));
        const base = position.get('Location') ? (entity(position, 'Location').get('Coordinates') as number[]) : [0, 0, 0];
        const mirrored = npTo3d(this.mirror2dPoint(base.slice(0, 2), { mirrorAxes: axes, mirrorPoint }), { z: base[2]! });
        entity(position, 'Location').set('Coordinates', ifcSafeVectorType(mirrored));
        const sweptArea = entity(c, 'SweptArea');
        const curves = [entity(sweptArea, 'OuterCurve'), ...((sweptArea.isA('IfcArbitraryProfileDefWithVoids') ? sweptArea.get('InnerCurves') : []) as Entity[])];
        for (const curve of curves) {
          this.translate(curve, base.slice(0, 2));
          this.mirror(curve, { mirrorAxes: axes, mirrorPoint, placementMatrix: placement });
          this.translate(curve, [-mirrored[0]!, -mirrored[1]!]);
        }
        // The extrusion in world space; the mirror point does not move a direction.
        const extruded = apply(placement, entity(c, 'ExtrudedDirection').get('DirectionRatios') as number[]);
        const direction = npTo3d(this.mirror2dPoint(extruded.subarray(0, 2), { mirrorAxes: axes, mirrorPoint: [0.0, 0.0] }), { z: extruded[2]! });
        entity(c, 'ExtrudedDirection').set('DirectionRatios', ifcSafeVectorType(apply(inverse3(placement), direction)));
      } else if (c.isA('IfcTrimmedCurve')) {
        const trims = [(c.get('Trim1') as Entity[])[0]!, (c.get('Trim2') as Entity[])[0]!];
        let coords = trims.map(trim => this.mirror2dPoint(trim.get('Coordinates') as number[], { mirrorAxes: axes, mirrorPoint }));
        // Mirroring by one axis only reverses the direction, so the trim points change places.
        if (Array.from(axes).includes(0)) coords = [coords[1]!, coords[0]!];
        trims.forEach((trim, i) => trim.set('Coordinates', ifcSafeVectorType(coords[i]!)));
        this.mirror(entity(c, 'BasisCurve'), { mirrorAxes: axes, mirrorPoint });
      } else {
        throw new Error(`${c} is not supported for mirror() method.`);
      }
      processed.push(c);
    }
  }
  return multipleObjects || multipleTransformations ? processed : processed[0]!;
}

/**
 * Rotates curves (polylines, circles) and extrusions in place, or copies with `createCopy`, by `angle`
 * degrees (clockwise unless `counterClockwise`) about `pivotPoint`.
 */
export function ShapeBuilderRotate(
  this: ShapeBuilder,
  curveOrItem: Entity | Entity[],
  options: { angle?: number; pivotPoint?: VectorLike; counterClockwise?: boolean; createCopy?: boolean } = {},
): Entity | Entity[] {
  const { angle = 90.0, pivotPoint = [0.0, 0.0], counterClockwise = false, createCopy = false } = options;
  const multipleObjects = Array.isArray(curveOrItem);
  const processed: Entity[] = [];
  for (const item of multipleObjects ? curveOrItem : [curveOrItem]) {
    const c = createCopy ? (copyDeep(this.file, item) as Entity) : item;
    const rotateOptions = { angle, pivotPoint, counterClockwise };
    if (['IfcIndexedPolyCurve', 'IfcPolyline'].includes(c.isA())) {
      this.setPolylineCoords(c, this.getPolylineCoords(c).map(co => this.rotate2dPoint(co, rotateOptions)));
    } else if (c.isA('IfcCircle')) {
      const location = entity(entity(c, 'Position'), 'Location');
      location.set('Coordinates', ifcSafeVectorType(this.rotate2dPoint(location.get('Coordinates') as number[], rotateOptions)));
    } else if (c.isA('IfcExtrudedAreaSolid')) {
      const location = entity(entity(c, 'Position'), 'Location');
      const base = location.get('Coordinates') as number[];
      const rotated = npTo3d(this.rotate2dPoint(base.slice(0, 2), rotateOptions));
      rotated[2] = base[2]!;
      location.set('Coordinates', ifcSafeVectorType(rotated));
      this.rotate(entity(entity(c, 'SweptArea'), 'OuterCurve'), rotateOptions);
    } else {
      throw new Error(`${c} is not supported for rotate() method.`);
    }
    processed.push(c);
  }
  return multipleObjects ? processed : processed[0]!;
}

const samePoint = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((value, i) => value === b[i]);

/**
 * The points and segments (2 point indices for a line, 3 for an arc) of a 2D curve through `coords`,
 * with a fillet of a radius at the points of `fillets`, and the IfcIndexedPolyCurve with `createIfcCurve`.
 */
export function ShapeBuilderGetSimple2dcurveData(
  this: ShapeBuilder,
  coords: ArrayLike<VectorLike>,
  options: { fillets?: ArrayLike<number>; filletRadius?: number | ArrayLike<number>; closed?: boolean; createIfcCurve?: boolean } = {},
): [number[][], number[][], Entity | null] {
  const { closed = true, createIfcCurve = false } = options;
  const filletIndices = Array.from(options.fillets ?? []);
  const radius = options.filletRadius ?? [];
  // One radius for all fillets.
  const radii = typeof radius === 'number' ? filletIndices.map(() => radius) : Array.from(radius);
  const fillets = new Map<number, number>();
  filletIndices.forEach((index, i) => {
    if (i < radii.length) fillets.set(index, radii[i]!);
  });
  let segments: number[][] = [];
  let points: number[][] = [];
  const count = coords.length;
  for (let coI = 0; coI < count; coI++) {
    const co = coords[coI]!;
    const currentPoint = points.length;
    if (fillets.has(coI)) {
      const r = fillets.get(coI)!;
      const rsb = r * Math.cos(Math.PI / 4); // The big radius shift.
      const rss = r - rsb; // The small radius shift.
      const nextCo = coords[(coI + 1) % count]!;
      const previousCo = coords[(coI - 1 + count) % count]!;
      // The type of the fillet (one of 4).
      const xDirection = co[0]! < previousCo[0]! || co[0]! < nextCo[0]! ? 1 : -1;
      const yDirection = co[1]! < previousCo[1]! || co[1]! < nextCo[1]! ? 1 : -1;
      const xshift = [co[0]! + r * xDirection, co[1]!];
      const middle = [co[0]! + rss * xDirection, co[1]! + rss * yDirection];
      const yshift = [co[0]!, co[1]! + r * yDirection];
      // The direction of the fillet.
      if (co[1] === previousCo[1]) points.push(xshift, middle, yshift);
      else points.push(yshift, middle, xshift);
      segments.push([currentPoint - 1, currentPoint]);
      segments.push([currentPoint, currentPoint + 1, currentPoint + 2]);
    } else {
      points.push(Array.from(co));
      if (coI !== 0) segments.push([currentPoint - 1, currentPoint]);
    }
  }
  if (closed) segments.push([points.length - 1, 0]);
  // The index -1 of a fillet at the first point.
  if (segments[0]![0] === -1) segments[0]![0] = points.length - 1;

  // Fillet points can be the same as the previous or next points: they are removed at the end.
  const pointsToRemove: number[] = [];
  let prevPoint = 0;
  for (let i = 1; i < points.length; i++) {
    if (!samePoint(points[i]!, points[prevPoint]!)) {
      prevPoint = i;
      continue;
    }
    segments = segments.map(s => s.map(ps => (ps !== i ? ps : prevPoint)));
    pointsToRemove.push(i);
  }
  let validSegments = segments.filter(segment => new Set(segment).size !== 1);
  points = points.filter((_, i) => !pointsToRemove.includes(i));
  // The point indices in order.
  const uniquePoints = [...new Set(validSegments.flat())].sort((a, b) => a - b);
  const translation = new Map(uniquePoints.map((previous, i) => [previous, i]));
  validSegments = validSegments.map(s => s.map(p => translation.get(p)!));

  let ifcCurve: Entity | null = null;
  if (createIfcCurve) {
    const ifcPoints = this.file.create('IfcCartesianPointList2D', [ifcSafeVectorType(points)]);
    const ifcSegments: Entity[] = [];
    for (const segment of validSegments) {
      const indices = segment.map(i => i + 1);
      if (indices.length === 2) ifcSegments.push(this.file.create('IfcLineIndex', [indices]));
      else if (indices.length === 3) ifcSegments.push(this.file.create('IfcArcIndex', [indices]));
    }
    ifcCurve = this.file.create('IfcIndexedPolyCurve', { Points: ifcPoints, Segments: ifcSegments });
  }
  return [points, validSegments, ifcCurve];
}

function sub3(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

function dot3(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

/**
 * An IfcFaceSurface of a planar polygon: its edges, and an IfcPlane at the first point with the
 * normal of Newell's method and the first edge (made normal to it) as X.
 */
export function ShapeBuilderFaceSurface(this: ShapeBuilder, points: ArrayLike<VectorLike>): Entity {
  const coordinates = Array.from(points, p => [Number(p[0]), Number(p[1]), Number(p[2])]);
  if (coordinates.length < 3) throw new Error('A face needs at least 3 points');
  // Newell's method: exact for a planar polygon, whichever corners are convex.
  let normal = [0, 0, 0];
  coordinates.forEach((p, i) => {
    normal = add(normal, cross(p, coordinates[(i + 1) % coordinates.length]!));
  });
  const length = Math.hypot(...normal);
  if (length === 0.0) throw new Error('The points of a face must not all lie on one line');
  normal = normal.map(v => v / length);
  let xAxis = sub3(coordinates[1]!, coordinates[0]!);
  const along = dot3(xAxis, normal);
  xAxis = xAxis.map((v, i) => v - along * normal[i]!);
  const xLength = Math.hypot(...xAxis);
  xAxis = xAxis.map(v => v / xLength);

  const vertices = coordinates.map(p => this.vertex({ position: p }));
  const edges = vertices.map((start, i) =>
    this.file.create('IfcOrientedEdge', [null, null, this.file.create('IfcEdge', [start, vertices[(i + 1) % vertices.length]!]), true]),
  );
  const plane = this.file.create('IfcPlane', [
    this.file.create('IfcAxis2Placement3D', [
      this.file.create('IfcCartesianPoint', [ifcSafeVectorType(coordinates[0]!)]),
      this.file.create('IfcDirection', [ifcSafeVectorType(normal)]),
      this.file.create('IfcDirection', [ifcSafeVectorType(xAxis)]),
    ]),
  ]);
  const bound = this.file.create('IfcFaceOuterBound', [this.file.create('IfcEdgeLoop', [edges]), true]);
  return this.file.create('IfcFaceSurface', [[bound], plane, true]);
}

/**
 * An IfcPolygonalFaceSet of the points extruded along `extrusionVector` by `magnitude`, moved by
 * `offset`: the side faces and, unless left out, the start and end caps.
 */
export function ShapeBuilderExtrudeFaceSet(
  this: ShapeBuilder,
  points: ArrayLike<VectorLike>,
  magnitude: number,
  options: { extrusionVector?: VectorLike; offset?: VectorLike | null; startCap?: boolean; endCap?: boolean } = {},
): Entity {
  const { extrusionVector = [0, 0, 1], offset = null, startCap = true, endCap = true } = options;
  let startPoints = Array.from(points, p => Array.from(p));
  if (offset !== null && Array.from(offset).some(v => v !== 0)) startPoints = startPoints.map(p => add(p, offset));
  const extrusionOffset = Array.from(extrusionVector, v => v * magnitude);
  const endPoints = startPoints.map(p => add(p, extrusionOffset));
  const n = startPoints.length;
  const last = n - 1;
  const faces: number[][] = [];
  for (let i = 0; i < last; i++) faces.push([i, i + 1, n + i + 1, n + i]);
  faces.push([last, 0, n + 0, n + last]); // Closes the loop.
  if (endCap) faces.push(Array.from({ length: n }, (_, i) => n + i));
  if (startCap) faces.push(Array.from({ length: n }, (_, i) => n - 1 - i));
  return this.polygonalFaceSet([...startPoints, ...endPoints], faces);
}

/** The single profile of an element with an IfcMaterialProfileSet of one profile, or null. */
function singleProfile(element: Entity): Entity | null {
  const material = getMaterial(element, { shouldSkipUsage: true });
  if (material && material.isA('IfcMaterialProfileSet')) {
    const profiles = material.get('MaterialProfiles') as Entity[];
    if (profiles.length === 1) return profiles[0]!.get('Profile') as Entity;
  }
  return null;
}

/** The half dimensions of a rectangle or circle profile and the depth, or null for other profiles. */
function halfDimensions(profile: Entity, depth: number): number[] | null {
  if (profile.isA('IfcRectangleProfileDef')) return [(profile.get('XDim') as number) / 2, (profile.get('YDim') as number) / 2, depth];
  if (profile.isA('IfcCircleProfileDef')) return [profile.get('Radius') as number, profile.get('Radius') as number, depth];
  return null;
}

const times = (v: ArrayLike<number>, factors: number[]) => factors.map((f, i) => v[i]! * f);

/**
 * The length of a transition between two profiles (half dimensions x, y, depth) so that its sides
 * are at most `angle` degrees from the axis, or null when it is not possible; see mepTransitionCalculate.
 */
export function ShapeBuilderMepTransitionLength(
  this: ShapeBuilder,
  startHalfDim: ArrayLike<number>,
  endHalfDim: ArrayLike<number>,
  angle: number,
  options: { profileOffset?: VectorLike; verbose?: boolean } = {},
): number | null {
  const { profileOffset = [0.0, 0.0], verbose = false } = options;
  // Vectors have floating point noise, which can give a negative value under the square root.
  const offset = npRoundToPrecision(profileOffset, 1);
  const diff = [Math.abs(startHalfDim[0]! - endHalfDim[0]!), Math.abs(startHalfDim[1]! - endHalfDim[1]!)];
  if (verbose) console.log(`offset = ${Array.from(profileOffset)} / ${Array.from(offset)}\ndiff = ${diff}`);

  const checkTransition = (endProfile: boolean): number | null => {
    const length = this.mepTransitionCalculate(startHalfDim, endHalfDim, offset, { diff, verbose, angle, endProfile }) as number | null;
    if (length === null) return null;
    const otherSideAngle = this.mepTransitionCalculate(startHalfDim, endHalfDim, offset, { diff, verbose, length, endProfile: !endProfile }) as number | null;
    if (otherSideAngle === null) return null;
    // A fixed good value for this case, for now.
    const sameDimension = isX(!endProfile ? diff[1]! : diff[0]!, 0);
    const requestedAngle = sameDimension && isX(!endProfile ? offset[1]! : offset[0]!, 0) ? 90.0 : angle;
    if (verbose) console.log(`other_side_angle = ${otherSideAngle}, requested_angle = ${requestedAngle}`);
    // The worst (largest) angle of the transition is `requestedAngle`.
    if (otherSideAngle < requestedAngle || isX(otherSideAngle, requestedAngle)) {
      if (verbose) console.log(`final length = ${length}, angle = ${requestedAngle}, other side angle = ${otherSideAngle}`);
      return length;
    }
    return null;
  };
  return checkTransition(false) || checkTransition(true);
}

/**
 * Without `length`: the length of a transition whose side on one axis (Y with `endProfile`) is at
 * `angle` degrees. With `length`: the angle of that side. Null when the length is not possible. The
 * verbose output gives the failures; the checks of the angle that Python prints are left out.
 */
export function ShapeBuilderMepTransitionCalculate(
  this: ShapeBuilder,
  startHalfDim: ArrayLike<number>,
  endHalfDim: ArrayLike<number>,
  offsetIn: ArrayLike<number>,
  options: { diff?: ArrayLike<number> | null; endProfile?: boolean; length?: number | null; angle?: number | null; verbose?: boolean } = {},
): number | null {
  const { endProfile = false, verbose = false, length = null } = options;
  let { angle = null } = options;
  let diff: number[] = options.diff ? Array.from(options.diff) : [Math.abs(startHalfDim[0]! - endHalfDim[0]!), Math.abs(startHalfDim[1]! - endHalfDim[1]!)];
  let offset: number[] = Array.from(offsetIn);
  if (endProfile) [diff, offset] = [[diff[1]!, diff[0]!], [offset[1]!, offset[0]!]];
  const log = (message: string) => verbose && console.log(message);
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const degrees = (r: number) => (r * 180) / Math.PI;

  const sameDimension = isX(diff[0]!, 0);
  const a = diff[0]! + offset[0]!;
  const b = diff[0]! - offset[0]!;
  if (length === null) {
    let h: number;
    if (!sameDimension) {
      if (angle === null) throw new Error('AssertionError');
      const t = Math.tan(radians(angle));
      const h0 = a ** 2 + 4 * a * b * t ** 2 + 2 * a * b + b ** 2;
      if (h0 < 0) {
        log(`B. Coulndn't calculate transition length for angle = ${angle}, offset = ${offset}, diff = ${diff}`);
        return null;
      }
      h = (a + b + Math.sqrt(h0)) / (2 * t);
    } else if (isX(offset[0]!, 0)) {
      angle = 90; // A fixed good value for this case, for now.
      h = startHalfDim[0]! / Math.tan(radians(angle / 2));
    } else {
      if (angle === null) throw new Error('AssertionError');
      h = offset[0]! / Math.tan(radians(angle));
    }
    const lengthSquared = h ** 2 - offset[1]! ** 2;
    if (lengthSquared <= 0) {
      log(`${sameDimension && !isX(offset[0]!, 0) ? 'C' : 'B'}. angle = ${angle} requires h = ${h} which is not possible with y offset = ${offset[1]}`);
      return null;
    }
    return Math.sqrt(lengthSquared);
  }
  if (angle === null) {
    if (!sameDimension) {
      if (length === 0) return 0;
      const h = Math.sqrt(length ** 2 + offset[1]! ** 2);
      const t = (-h * (a + b)) / (a * b - h ** 2);
      return degrees(Math.atan(t));
    }
    const h = Math.sqrt(length ** 2 + offset[1]! ** 2);
    return isX(offset[0]!, 0) ? degrees(2 * Math.atan(startHalfDim[0]! / h)) : degrees(Math.atan(offset[0]! / h));
  }
  return null;
}

/** The 16 (or `segments`) points of a circle of a radius in the XY plane, from (R, 0), counter-clockwise. */
function circlePoints(radius: number, segments = 16): number[][] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (2 * Math.PI * i) / segments;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0 * radius];
  });
}

/**
 * A Tessellation representation of the transition between the profiles of two segments (rectangles,
 * circles, or a rectangle and a circle) with straight parts of `startLength` and `endLength`, and its
 * data; [null, null] for other profiles or an impossible angle.
 */
export function ShapeBuilderMepTransitionShape(
  this: ShapeBuilder,
  startSegment: Entity,
  endSegment: Entity,
  startLength: number,
  endLength: number,
  options: { angle?: number; profileOffset?: VectorLike } = {},
): [Entity, Record<string, unknown>] | [null, null] {
  const { angle = 30.0, profileOffset = [0.0, 0.0] } = options;
  const startProfile = singleProfile(startSegment);
  const endProfile = singleProfile(endSegment);
  if (startProfile === null || endProfile === null) return [null, null];
  const startHalfDim = halfDimensions(startProfile, startLength);
  const endHalfDim = halfDimensions(endProfile, endLength);
  // Profile types that are not supported.
  if (startHalfDim === null || endHalfDim === null) return [null, null];

  const transitionItems: Entity[] = [];
  const startOffset = [0, 0, startLength];
  const endExtrusionOffset = [...startOffset];
  let transitionLength = this.mepTransitionLength(startHalfDim, endHalfDim, angle, { profileOffset }) as number | null;
  if (transitionLength === null) return [null, null];

  let faces: number[][] = [];
  endExtrusionOffset[2]! += transitionLength;
  endExtrusionOffset[0]! += profileOffset[0]!;
  endExtrusionOffset[1]! += profileOffset[1]!;
  let points: number[][];

  if (startProfile.isA('IfcRectangleProfileDef') && endProfile.isA('IfcRectangleProfileDef')) {
    // No transition between equal profiles.
    if (transitionLength === 0) return [null, null];
    faces.push([3, 4, 7, 0], [11, 8, 15, 12], [3, 11, 12, 4], [7, 15, 8, 0]);
    // Clockwise, for the orientation of the faces: the start, then the end extrusion.
    faces.push([0, 1, 2, 3], [8, 11, 10, 9], [0, 8, 9, 1], [1, 9, 10, 2], [2, 10, 11, 3]);
    faces.push([4, 5, 6, 7], [12, 15, 14, 13], [4, 12, 13, 5], [5, 13, 14, 6], [6, 14, 15, 7]);
    const end = (factors: number[]) => add(times(endHalfDim, factors), endExtrusionOffset);
    points = [
      times(startHalfDim, [-1, -1, 1]),
      times(startHalfDim, [-1, -1, 0]),
      times(startHalfDim, [1, -1, 0]),
      times(startHalfDim, [1, -1, 1]),
      end([1, -1, 0]),
      end([1, -1, 1]),
      end([-1, -1, 1]),
      end([-1, -1, 0]),
      times(startHalfDim, [-1, 1, 1]),
      times(startHalfDim, [-1, 1, 0]),
      times(startHalfDim, [1, 1, 0]),
      times(startHalfDim, [1, 1, 1]),
      end([1, 1, 0]),
      end([1, 1, 1]),
      end([-1, 1, 1]),
      end([-1, 1, 0]),
    ];
  } else if (startProfile.isA('IfcCircleProfileDef') && endProfile.isA('IfcCircleProfileDef')) {
    if (transitionLength === 0) return [null, null];
    const nSegments = 16;
    const first = circlePoints(startProfile.get('Radius') as number, nSegments);
    const second = circlePoints(endProfile.get('Radius') as number, nSegments);
    faces = Array.from({ length: nSegments }, (_, i) => {
      const next = (i + 1) % nSegments; // Around the circle.
      return [i, next, next + nSegments, i + nSegments];
    });
    transitionItems.push(this.extrudeFaceSet(first, startLength, { endCap: false }));
    transitionItems.push(this.extrudeFaceSet(second, endLength, { offset: endExtrusionOffset, startCap: false }));
    points = [...first.map(p => add(p, startOffset)), ...second.map(p => add(p, endExtrusionOffset))];
  } else {
    // A rectangle and a circle, also of the same dimensions.
    if (transitionLength === 0) {
      transitionLength = (startLength + endLength) / 2;
      endExtrusionOffset[2]! += transitionLength;
    }
    const startingWithCircle = startProfile.isA('IfcCircleProfileDef');
    const [circleProfile, rectProfile] = startingWithCircle ? [startProfile, endProfile] : [endProfile, startProfile];
    let circle = circlePoints(circleProfile.get('Radius') as number);
    const half = [(rectProfile.get('XDim') as number) / 2, (rectProfile.get('YDim') as number) / 2, 0 / 2];
    // From (+X/2, +Y/2), counter-clockwise.
    let rect = [[1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 0]].map(factors => times(half, factors));
    const [startPoints, endPoints] = startingWithCircle ? [circle, rect] : [rect, circle];
    transitionItems.push(this.extrudeFaceSet(startPoints, startLength, { endCap: false }));
    transitionItems.push(this.extrudeFaceSet(endPoints, endLength, { offset: endExtrusionOffset, startCap: false }));
    if (startingWithCircle) {
      circle = circle.map(p => add(p, startOffset));
      rect = rect.map(p => add(p, endExtrusionOffset));
    } else {
      rect = rect.map(p => add(p, startOffset));
      circle = circle.map(p => add(p, endExtrusionOffset));
    }
    // The circle points are 0-15, the rectangle points 16-19.
    points = [...circle, ...rect];
    let transitionFaces = [
      [0, 19, 16], [0, 16, 1], [1, 16, 2], [2, 16, 3], [3, 16, 4],
      [4, 16, 17], [4, 17, 5], [5, 17, 6], [6, 17, 7], [7, 17, 8],
      [8, 17, 18], [8, 18, 9], [9, 18, 10], [10, 18, 11], [11, 18, 12],
      [12, 18, 19], [12, 19, 13], [13, 19, 14], [14, 19, 15], [15, 19, 0],
    ];
    // Reversed when starting with the circle, for the orientation of the faces.
    if (startingWithCircle) transitionFaces = transitionFaces.map(f => [...f].reverse());
    faces.push(...transitionFaces);
  }

  transitionItems.push(this.polygonalFaceSet(points, faces));
  const body = getContext(this.file, 'Model', { subcontext: 'Body', targetView: 'MODEL_VIEW' });
  if (!body) throw new Error('AssertionError');
  const representation = this.getRepresentation(body, transitionItems, { representationType: 'Tessellation' });
  return [
    representation,
    {
      start_length: startLength,
      end_length: endLength,
      angle,
      profile_offset: profileOffset,
      transition_length: transitionLength,
      full_transition_length: startLength + transitionLength + endLength,
    },
  ];
}

/**
 * A representation of a bend of `angle` radians and `radius` of a segment profile toward
 * `bendVector`, with straight parts of `startLength` and `endLength`, and its data.
 */
export function ShapeBuilderMepBendShape(
  this: ShapeBuilder,
  segment: Entity,
  startLength: number,
  endLength: number,
  angle: number,
  radius: number,
  bendVector: VectorLike,
  flipZAxis: boolean,
): [Entity, Record<string, unknown>] {
  const siConversion = calculateUnitScale(this.file);
  const profile = singleProfile(segment);
  if (!profile) throw new Error('AssertionError');
  const isCircularProfile = profile.isA('IfcCircleProfileDef');
  const profileDim = halfDimensions(profile, startLength);
  if (profileDim === null) throw new Error('AssertionError');

  const rounded = npRoundToPrecision(bendVector, siConversion);
  const lateralAxis = [0, 1].find(i => !isX(rounded[i]!, 0));
  if (lateralAxis === undefined) throw new Error('StopIteration');
  const nonLateralAxis = lateralAxis === 0 ? 1 : 0;
  const lateralSign = Math.sign(bendVector[lateralAxis]!);
  const zSign = flipZAxis ? -1 : 1;
  const theta = angle;

  // The centre of the bend circle.
  const center = [0, 0, 0];
  center[lateralAxis] = (radius + profileDim[lateralAxis]!) * lateralSign;

  const circlePointsAt = (angles: number[], r: number): number[][] =>
    angles.map(a => {
      const shifted = a - Math.PI / 2;
      const point = [0, 0, 0];
      point[2] = zSign * Math.cos(shifted) * r;
      point[lateralAxis] = lateralSign * Math.sin(shifted) * r;
      return point;
    });
  const circleTangent = (a: number): number[] => {
    const tangent = [0, 0, 0];
    tangent[2] = Math.cos(a) * zSign;
    tangent[lateralAxis] = Math.sin(a) * lateralSign;
    return tangent;
  };

  const bendItem = (): Entity => {
    let r = radius;
    const thetaSegments = [0.0, theta / 2, theta];
    let points: number[][];
    let arcPoints: number[];
    if (isCircularProfile) {
      r += profileDim[lateralAxis]!;
      points = circlePointsAt(thetaSegments, r);
      arcPoints = [1];
    } else {
      const outerPoints = circlePointsAt([...thetaSegments].reverse(), r + 2 * profileDim[lateralAxis]!);
      if (isX(r, 0)) {
        points = [...circlePointsAt([theta], r), ...outerPoints];
        arcPoints = [2];
      } else {
        points = [...circlePointsAt(thetaSegments, r), ...outerPoints];
        arcPoints = [1, 4];
      }
    }
    points = points.map(p => add(p, center));
    const offset = [0, 0, 0];
    offset[2] = zSign * startLength;
    if (isCircularProfile) {
      const bendPath = this.polyline(points, { closed: false, arcPoints, positionOffset: offset });
      return this.createSweptDiskSolid(bendPath, profileDim[lateralAxis]!);
    }
    offset[nonLateralAxis] = -profileDim[nonLateralAxis]!;
    const kwargs = this.extrudeKwargs('XY'[nonLateralAxis]!);
    const profileCurve = this.polyline(points.map(p => [p[lateralAxis]!, p[2]!]), { arcPoints, closed: true });
    return this.extrude(this.profile(profileCurve), {
      magnitude: profileDim[nonLateralAxis]! * 2,
      position: offset,
      positionXAxis: kwargs.position_x_axis,
      positionZAxis: kwargs.position_z_axis,
      extrusionVector: kwargs.extrusion_vector,
    });
  };

  const repItems: Entity[] = [bendItem()];
  if (startLength) repItems.push(this.extrude(profile, { magnitude: startLength, extrusionVector: [0, 0, zSign] }));
  if (endLength) {
    const endPosition = add(center, circlePointsAt([theta], radius + profileDim[lateralAxis]!)[0]!);
    endPosition[2]! += startLength * zSign;
    // The extrusion space after the bend: the tangent involves only two axes, so the other is unchanged.
    const zAxis = circleTangent(theta);
    const xAxis = lateralAxis === 0 ? cross(zAxis, [0, 1, 0]) : [1, 0, 0];
    repItems.push(this.extrude(profile, { magnitude: endLength, position: endPosition, positionZAxis: zAxis, extrusionVector: [0, 0, 1], positionXAxis: xAxis }));
  }
  const body = getContext(this.file, 'Model', { subcontext: 'Body', targetView: 'MODEL_VIEW' });
  if (!body) throw new Error('AssertionError');
  return [
    this.getRepresentation(body, repItems),
    {
      start_length: startLength,
      end_length: endLength,
      radius,
      angle: (theta * 180) / Math.PI,
      lateral_axis: lateralAxis,
      lateral_sign: lateralSign,
      z_axis_sign: flipZAxis ? -1 : 1,
      main_profile_dimension: profileDim[lateralAxis],
    },
  ];
}
