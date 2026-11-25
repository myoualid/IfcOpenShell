// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.geometry.regenerate_wall_representation Regenerator methods that use numpy in Python, written by
// hand with arrays of numbers: 2D points (x, y), 3D vectors (x, y, z) and flat row-major 4x4 matrices.
// The generated Regenerator class assigns them to its methods (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import { addBoolean } from '../api/geometry/add_boolean.js';
import { assignRepresentation } from '../api/geometry/assign_representation.js';
import type { Regenerator } from '../api/geometry/regenerate_wall_representation.js';
import { getMaterial, removeDeep2, replaceElement } from '../util/element.js';
import { getRepresentation, getReferenceLine, resolveRepresentation } from '../util/representation.js';
import { isX, ShapeBuilder } from '../util/shape_builder.js';
import { editObjectPlacement } from './object_placement.js';
import { getPlacement } from './placement.js';
import { npAngleSigned } from './shape_builder.js';

type Entity = EntityInstance;
type Point = number[];
/** A layer boundary: its two points, at the start and at the end of the reference line. */
type Axis = Point[];
/** The PrioritisedLayer named tuple of Python. */
interface Layer {
  priority: number;
  thickness: number;
}
interface WallVectors {
  z: number[];
  y: number[];
  a: number;
  d: number;
  h: number;
}

const Z_UP = [0.0, 0.0, 1.0];

/** numpy.allclose with its default tolerances. */
function allClose(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  return Array.from(a).every((value, i) => Math.abs(value - b[i]!) <= 1e-8 + 1e-5 * Math.abs(b[i]!));
}

function cross(a: number[], b: number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}

function norm(v: number[]): number {
  return Math.hypot(...v);
}

const scaled = (v: number[], factor: number): number[] => v.map(value => value * factor);

/** The product of a flat row-major 4x4 matrix and a vector of 4 values. */
function apply4(m: ArrayLike<number>, v: number[]): number[] {
  return [0, 1, 2, 3].map(row => m[row * 4]! * v[0]! + m[row * 4 + 1]! * v[1]! + m[row * 4 + 2]! * v[2]! + m[row * 4 + 3]! * v[3]!);
}

/** The inverse of a flat row-major 4x4 matrix (Gauss-Jordan elimination with partial pivoting). */
function inverse4(m: ArrayLike<number>): Float64Array {
  const a = Array.from({ length: 4 }, (_, row) => [...Array.from({ length: 4 }, (__, column) => m[row * 4 + column]!), ...[0, 1, 2, 3].map(c => (c === row ? 1 : 0))]);
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) pivot = row;
    if (a[pivot]![column] === 0) throw new Error('Singular matrix');
    [a[column], a[pivot]] = [a[pivot]!, a[column]!];
    const divisor = a[column]![column]!;
    a[column] = a[column]!.map(value => value / divisor);
    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const factor = a[row]![column]!;
      a[row] = a[row]!.map((value, k) => value - factor * a[column]![k]!);
    }
  }
  return Float64Array.from(a.flatMap(row => row.slice(4)));
}

/** util.shape_builder.intersect_x_axis_2d: the x where the line through p1 and p2 is at y, or null if it is parallel. */
function intersectXAxis2d(p1: Point, p2: Point, y: number): number | null {
  const [x1, y1] = [p1[0]!, p1[1]!];
  const [x2, y2] = [p2[0]!, p2[1]!];
  if (isX(y1, y2)) return null;
  const t = (y - y1) / (y2 - y1);
  return x1 + t * (x2 - x1);
}

/** The vector of the join of two walls: the cross product of their Y vectors, pointing up. */
export function RegeneratorGetJoinVector(this: Regenerator, y1: number[], y2: number[]): number[] {
  const result = cross(y1, y2);
  return result[2]! < 0 ? scaled(result, -1) : result;
}

/**
 * The extrusion of a wall body: its unit direction z, the Y vector y (z x X), the angle a of z from
 * vertical, the depth d and the height h. A wall without body uses the fallback angle and height.
 */
export function RegeneratorGetWallVectors(this: Regenerator, wall: Entity): WallVectors {
  const body = getRepresentation(wall, 'Model', { subcontext: 'Body', targetView: 'MODEL_VIEW' });
  if (body) {
    for (let item of resolveRepresentation(body).get('Items') as Entity[]) {
      while (item.isA('IfcBooleanResult')) item = item.get('FirstOperand') as Entity;
      if (item.isA('IfcExtrudedAreaSolid')) {
        const direction = (item.get('ExtrudedDirection') as Entity).get('DirectionRatios') as number[];
        const z = scaled(direction, 1 / norm(direction));
        const y = cross(z, [1.0, 0.0, 0.0]);
        const d = item.get('Depth') as number;
        const h = z[2]! * d;
        const a = npAngleSigned([0.0, 1.0], z.slice(1));
        if (!isX(a, 0)) this.is_angled = true;
        return { z, y, a, d, h };
      }
    }
  } else if (this.fallback_angle) {
    const a = this.fallback_angle as number;
    const z = [0.0, Math.sin(a), Math.cos(a)];
    const y = cross(z, [1.0, 0.0, 0.0]);
    const h = this.fallback_height as number;
    const d = norm(scaled(z, h / z[2]!));
    if (!isX(a, 0)) this.is_angled = true;
    return { z, y, a, d, h };
  }
  return { z: [...Z_UP], y: [0.0, 1.0, 0.0], a: 0.0, d: this.fallback_height as number, h: this.fallback_height as number };
}

/**
 * The layer boundaries of a wall: the reference line moved to the base of the layer set (its usage
 * offset), then one line further for each layer, by its thickness across the angle of the wall.
 */
export function RegeneratorGetAxes(this: Regenerator, wall: Entity, reference: Point[], layers: Layer[], angle: number): Axis[] {
  const axes: Axis[] = [reference.map(p => [...p])];
  let senseFactor = 1;
  const usage = getMaterial(wall);
  if (usage && usage.isA('IfcMaterialLayerSetUsage')) {
    for (const point of axes[0]!) point[1]! += usage.get('OffsetFromReferenceLine') as number;
    senseFactor = usage.get('DirectionSense') === 'POSITIVE' ? 1 : -1;
  }
  for (const layer of layers) {
    const yOffset = (layer.thickness * senseFactor) / Math.cos(angle);
    axes.push(axes[axes.length - 1]!.map(p => [p[0]! + 0.0, p[1]! + yOffset]));
  }
  return axes;
}

/**
 * Joins the wall to another at a path connection: the points of the end (ATSTART, ATEND) of the wall,
 * mitered by layer priority, or, at ATPATH, the points of the cut or split that the other wall makes.
 */
export function RegeneratorJoin(
  this: Regenerator,
  wall1: Entity,
  wall2: Entity,
  layers1In: Layer[],
  layers2In: Layer[],
  connection1: string,
  connection2: string,
): void {
  if (connection1 === 'NOTDEFINED' || connection2 === 'NOTDEFINED') return;
  if (connection1 === 'ATPATH' && connection2 === 'ATPATH') return;
  let layers1 = layers1In;
  let layers2 = layers2In;

  const reference1 = Array.from(getReferenceLine(wall1, { fallbackLength: this.fallback_length }), p => Array.from(p));
  const reference2 = Array.from(getReferenceLine(wall2, { fallbackLength: this.fallback_length }), p => Array.from(p));
  const wallVectors2 = this.getWallVectors(wall2) as WallVectors;
  let axes1 = this.getAxes(wall1, reference1, layers1, this.wall_vectors.a) as Axis[];
  let axes2 = this.getAxes(wall2, reference2, layers2, wallVectors2.a) as Axis[];
  const matrix1i = inverse4(getPlacement({ placement: wall1.get('ObjectPlacement') as Entity }));
  const matrix2 = getPlacement({ placement: wall2.get('ObjectPlacement') as Entity });

  // The data of wall2 in the local coordinates of wall1.
  const toWall1 = (v: number[]) => apply4(matrix1i, apply4(matrix2, v));
  for (const axis of axes2) {
    axis[0] = toWall1([...axis[0]!, 0, 1]).slice(0, 2);
    axis[1] = toWall1([...axis[1]!, 0, 1]).slice(0, 2);
  }
  reference2[0] = toWall1([...reference2[0]!, 0, 1]).slice(0, 2);
  reference2[1] = toWall1([...reference2[1]!, 0, 1]).slice(0, 2);
  wallVectors2.z = toWall1([...wallVectors2.z, 0.0]).slice(0, 3);
  wallVectors2.y = toWall1([...wallVectors2.y, 0.0]).slice(0, 3);

  let axis2 = axes2[0]!; // Any axis of wall2.
  if (isX(axis2[0]![1]!, axis2[1]![1]!)) return; // Parallel.

  // The axes from interior to exterior.
  if (connection1 === 'ATEND') {
    if (axes2[0]![0]![0]! > axes2[axes2.length - 1]![0]![0]!) {
      // The layers in the +X direction.
      axes2 = [...axes2].reverse();
      layers2 = [...layers2].reverse();
    }
  } else if (connection1 === 'ATSTART') {
    if (axes2[axes2.length - 1]![0]![0]! > axes2[0]![0]![0]!) {
      // The layers in the -X direction.
      axes2 = [...axes2].reverse();
      layers2 = [...layers2].reverse();
    }
  }

  axis2 = axes2[0]!;
  // The axis "points" in the direction of the join.
  if (connection2 === 'ATSTART') axis2 = [axis2[1]!, axis2[0]!];
  if (axis2[0]![1]! < axis2[1]![1]!) {
    // Pointing +Y: layers1 in the +Y direction.
    if (axes1[axes1.length - 1]![0]![1]! < axes1[0]![0]![1]!) {
      axes1 = [...axes1].reverse();
      layers1 = [...layers1].reverse();
    }
  } else if (axes1[0]![0]![1]! < axes1[axes1.length - 1]![0]![1]!) {
    // Pointing -Y: layers1 in the -Y direction.
    axes1 = [...axes1].reverse();
    layers1 = [...layers1].reverse();
  }

  const at = (axis: Axis, y: number): Point => [intersectXAxis2d(axis[0]!, axis[1]!, y) as number, y];

  if (connection1 === 'ATPATH') {
    const firstY = axes1[0]![0]![1]!;
    const lastY = axes1[axes1.length - 1]![0]![1]!;
    const p0 = at(axes2[0]!, firstY);
    const pN = at(axes2[axes2.length - 1]!, firstY);

    // The CurveOnRelating/RelatedElement.
    const points: Point[] = [p0];
    let axisIndex = 0;
    for (const layer2 of layers2) {
      const ys = axes1.map(a => a[0]![1]!);
      let yIndex = 0;
      for (const layer1 of layers1) {
        if (layer2.priority <= layer1.priority) break;
        yIndex++;
        if (yIndex >= ys.length) throw new Error('StopIteration');
      }
      const y = ys[yIndex]!;
      const p1 = at(axes2[axisIndex]!, y);
      axisIndex++;
      if (axisIndex >= axes2.length) throw new Error('StopIteration');
      const p2 = at(axes2[axisIndex]!, y);
      if (points.length && allClose(points[points.length - 1]!, p1)) {
        points[points.length - 1] = p2; // Slide along the previous point.
      } else {
        points.push(p1, p2);
      }
    }
    // The curve ends at pN.
    if (!allClose(points[points.length - 1]!, pN)) points.push(pN);

    // The segments of the points either split or cut the wall.
    const splitYs = new Set([firstY, lastY]);
    let segment: Point[] = [];
    const atpathVector = this.getJoinVector(this.wall_vectors.y, wallVectors2.y) as number[];
    (this.atpath_points as [number[], Point[]][]).push([atpathVector, points]);
    for (const point of points) {
      segment.push(point);
      if (segment.length === 1) continue; // Not enough points for a segment.
      const ends = new Set([segment[0]![1]!, segment[segment.length - 1]![1]!]);
      if (ends.size === splitYs.size && [...ends].every(y => splitYs.has(y))) {
        // The segment splits the wall: in the +Y direction.
        if (segment[0]![1]! > segment[segment.length - 1]![1]!) segment.reverse();
        (this.split_points as Point[][]).push(segment);
        segment = [];
      } else if (segment[0]![1] === segment[segment.length - 1]![1]) {
        // The segment cuts some of the wall.
        if (segment[0]![1] === this.maxy) {
          // In the +X direction.
          if (segment[0]![0]! > segment[segment.length - 1]![0]!) segment.reverse();
          (this.maxpath_points as Point[][]).push(segment);
        } else if (segment[0]![1] === this.miny) {
          // In the -X direction.
          if (segment[segment.length - 1]![0]! > segment[0]![0]!) segment.reverse();
          (this.minpath_points as Point[][]).push(segment);
        }
        segment = [];
      }
    }
    return;
  }

  let points: Point[];
  if (connection2 === 'ATPATH') {
    points = [];
    const ys = axes1.map(a => a[0]![1]!);
    let yIndex = 0;
    for (const layer1 of layers1) {
      let axisIndex = 0;
      for (const layer2 of layers2) {
        if (layer1.priority <= layer2.priority) break;
        axisIndex++;
        if (axisIndex >= axes2.length) throw new Error('StopIteration');
      }
      const axis = axes2[axisIndex]!;
      const p1 = at(axis, ys[yIndex]!);
      yIndex++;
      if (yIndex >= ys.length) throw new Error('StopIteration');
      const p2 = at(axis, ys[yIndex]!);
      if (points.length && allClose(points[points.length - 1]!, p1)) points.push(p2);
      else points.push(p1, p2);
    }
  } else {
    // A connection at an end of both walls: mitered by layer priority (an ambiguity of bSI).
    const lastY = axes1[axes1.length - 1]![0]![1]!;
    const ys = axes1.map(a => a[0]![1]!);
    let yIndex = 0;
    let axisIndex = 0;
    const nextY = () => {
      yIndex++;
      if (yIndex >= ys.length) throw new Error('StopIteration');
      return ys[yIndex]!;
    };
    const nextAxis = () => {
      axisIndex++;
      if (axisIndex >= axes2.length) throw new Error('StopIteration');
      return axes2[axisIndex]!;
    };
    let axis = axes2[0]!;
    let y = ys[0]!;
    let x = intersectXAxis2d(axis[0]!, axis[1]!, y) as number;
    points = [[x, y]];
    let i1 = 0;
    let i2 = 0;
    let layer1: Layer | undefined = layers1[i1];
    let layer2: Layer | undefined = layers2[i2];
    while (layer1 && layer2) {
      if (layer1.priority > layer2.priority) {
        axis = nextAxis();
        x = intersectXAxis2d(axis[0]!, axis[1]!, y) as number;
        layer2 = layers2[++i2];
      } else if (layer2.priority > layer1.priority) {
        y = nextY();
        x = intersectXAxis2d(axis[0]!, axis[1]!, y) as number;
        layer1 = layers1[++i1];
      } else {
        y = nextY();
        const next = nextAxis();
        x = intersectXAxis2d(next[0]!, next[1]!, y) as number;
        layer1 = layers1[++i1];
        layer2 = layers2[++i2];
      }
      points.push([x, y]);
    }
    if (points[points.length - 1]![1] !== lastY) points.push(at(axes2[axes2.length - 1]!, lastY));
  }

  const vector = this.getJoinVector(this.wall_vectors.y, wallVectors2.y) as number[];
  const offset = scaled(vector, this.wall_vectors.h / vector[2]!)[0]!;
  const referenceX = intersectXAxis2d(reference2[0]!, reference2[1]!, reference1[0]![1]!) as number;
  if (connection1 === 'ATSTART') {
    this.start_points = points;
    this.start_vector = vector;
    this.start_offset = offset;
    this.reference_p1[0] = referenceX;
  } else if (connection1 === 'ATEND') {
    this.end_points = points;
    this.end_vector = vector;
    this.end_offset = offset;
    this.reference_p2[0] = referenceX;
  }
}

/** The operand that removes the part of an angled wall beyond a join: the points closed back to the start or end. */
function angledOperand(builder: ShapeBuilder, joinPoints: Point[], vector: number[], joinOffset: number, h: number, offset: Point | null, atStart: boolean): Entity {
  const points = [...joinPoints];
  while (isX(points[0]![1]!, points[1]![1]!)) points.shift();
  while (isX(points[points.length - 1]![1]!, points[points.length - 2]![1]!)) points.pop();
  const xs = points.map(p => p[0]!);
  const newx = atStart ? Math.min(...xs) - Math.abs(joinOffset) : Math.max(...xs) + Math.abs(joinOffset);
  const p1 = [...points[points.length - 1]!];
  p1[0] = newx;
  const p2 = [...p1];
  p2[1] = points[0]![1]!;
  points.push(p1, p2);
  return builder.extrude(builder.polyline(points, { closed: true, positionOffset: offset }), {
    magnitude: norm(scaled(vector, h / vector[2]!)),
    extrusionVector: vector,
  });
}

/**
 * Regenerates the Body (an extrusion of the layers, with the joins of the connected walls) and the
 * Axis representations of a wall, and moves the wall placement to the start of its reference line.
 */
export function RegeneratorRegenerate(
  this: Regenerator,
  wall: Entity,
  options: { length?: number; height?: number; angle?: number | null } = {},
): Entity | null {
  const { length = 1.0, height = 1.0, angle = null } = options;
  this.fallback_length = length / this.unit_scale;
  this.fallback_height = height / this.unit_scale;
  this.fallback_angle = angle;
  const layers = this.getLayers(wall) as Layer[];
  if (!layers.length) return null;
  const reference = Array.from(getReferenceLine(wall, { fallbackLength: this.fallback_length }), p => Array.from(p));
  [this.reference_p1, this.reference_p2] = reference;
  this.wall_vectors = this.getWallVectors(wall);
  const axes = this.getAxes(wall, reference, layers, this.wall_vectors.a) as Axis[];
  this.miny = axes[0]![0]![1];
  this.maxy = axes[axes.length - 1]![0]![1];
  this.end_point = null;
  this.start_points = [];
  this.start_vector = [...Z_UP];
  this.start_offset = 0.0;
  this.atpath_points = [];
  this.split_points = [];
  this.maxpath_points = [];
  this.minpath_points = [];
  this.end_points = [];
  this.end_vector = [...Z_UP];
  this.end_offset = 0.0;
  const manualBooleans = this.getManualBooleans(wall) as Entity[];

  for (const rel of wall.get('ConnectedTo') as Entity[]) {
    if (!rel.isA('IfcRelConnectsPathElements')) continue;
    const wall2 = rel.get('RelatedElement') as Entity;
    const layers1 = this.combineLayers([...layers], rel.get('RelatingPriorities') as number[] | null) as Layer[];
    const layers2 = this.combineLayers(this.getLayers(wall2), rel.get('RelatedPriorities') as number[] | null) as Layer[];
    if (!layers1.length || !layers2.length) continue;
    this.join(wall, wall2, layers1, layers2, rel.get('RelatingConnectionType') as string, rel.get('RelatedConnectionType') as string);
  }
  for (const rel of wall.get('ConnectedFrom') as Entity[]) {
    if (!rel.isA('IfcRelConnectsPathElements')) continue;
    const wall2 = rel.get('RelatingElement') as Entity;
    const layers1 = this.combineLayers([...layers], rel.get('RelatedPriorities') as number[] | null) as Layer[];
    const layers2 = this.combineLayers(this.getLayers(wall2), rel.get('RelatingPriorities') as number[] | null) as Layer[];
    if (!layers1.length || !layers2.length) continue;
    this.join(wall, wall2, layers1, layers2, rel.get('RelatedConnectionType') as string, rel.get('RelatingConnectionType') as string);
  }

  const miny = axes[axes.length - 2]![0]![1]!;
  const maxy = axes[axes.length - 1]![0]![1]!;
  let startPointsSelf = this.start_points as Point[];
  let endPointsSelf = this.end_points as Point[];
  if (!startPointsSelf.length) {
    const minx = axes[0]![0]![0]!;
    startPointsSelf = this.start_points = [[minx, axes[0]![0]![1]!], [minx, axes[axes.length - 1]![0]![1]!]];
  }
  if (!endPointsSelf.length) {
    const maxx = axes[0]![1]![0]!;
    endPointsSelf = this.end_points = [[maxx, axes[0]![0]![1]!], [maxx, axes[axes.length - 1]![0]![1]!]];
  }
  // In the +Y direction.
  if (startPointsSelf[0]![1]! > startPointsSelf[startPointsSelf.length - 1]![1]!) startPointsSelf.reverse();
  if (endPointsSelf[0]![1]! > endPointsSelf[endPointsSelf.length - 1]![1]!) endPointsSelf.reverse();

  const builder = new ShapeBuilder(this.file);
  // No offset with manual booleans, as it would also move their operands.
  const offset: Point | null = manualBooleans.length ? null : scaled(this.reference_p1, -1);
  const wallVectors = this.wall_vectors as WallVectors;

  let item: Entity;
  if (this.is_angled) {
    const startPoints = startPointsSelf.map(p => [...p]);
    const endPoints = endPointsSelf.map(p => [...p]);
    if (this.end_offset > 0) for (const point of endPoints) point[0]! += this.end_offset;
    if (this.start_offset < 0) for (const point of startPoints) point[0]! += this.start_offset;
    const points = [...startPoints, ...endPoints.reverse()];
    item = builder.extrude(builder.polyline(points, { closed: true, positionOffset: offset }), {
      magnitude: wallVectors.d,
      extrusionVector: wallVectors.z,
    });

    const operands: Entity[] = [];
    if (!allClose(this.start_vector, Z_UP)) {
      operands.push(angledOperand(builder, startPointsSelf, this.start_vector, this.start_offset, wallVectors.h, offset, true));
    }
    if (!allClose(this.end_vector, Z_UP)) {
      operands.push(angledOperand(builder, endPointsSelf, this.end_vector, this.end_offset, wallVectors.h, offset, false));
    }
    for (const [atpathVector, atpathPoints] of this.atpath_points as [number[], Point[]][]) {
      if (atpathPoints.length <= 2) continue;
      operands.push(
        builder.extrude(builder.polyline(atpathPoints, { closed: true, positionOffset: offset }), {
          magnitude: norm(scaled(atpathVector, wallVectors.h / atpathVector[2]!)),
          extrusionVector: atpathVector,
        }),
      );
    }
    if (operands.length) {
      const results = addBoolean(this.file, item, operands);
      item = results[results.length - 1]!;
    }
  } else {
    // The footprint may be several profiles, if an ATPATH connection splits the wall in two.
    const profiles: Entity[] = [];
    const minx = Math.max(...startPointsSelf.map(p => p[0]!));
    const maxx = Math.min(...endPointsSelf.map(p => p[0]!));
    // The islands in the +X direction, within the start and the end.
    const splits: Point[][] = [...(this.split_points as Point[][])]
      .sort((a, b) => a[0]![0]! - b[0]![0]!)
      .filter(points => !points.some(p => p[0]! > maxx || p[0]! < minx));
    splits.unshift(startPointsSelf.map(p => [...p]));
    splits.push(endPointsSelf.map(p => [...p]));

    if (maxy < miny) {
      [this.maxpath_points, this.minpath_points] = [this.minpath_points, this.maxpath_points];
      if (this.maxpath_points.length) this.maxpath_points[0] = [...this.maxpath_points[0]].reverse();
      if (this.minpath_points.length) this.minpath_points[0] = [...this.minpath_points[0]].reverse();
    }

    let index = 0;
    for (;;) {
      // Each profile is clockwise from (minx, miny).
      const startSplit = splits[index++];
      if (!startSplit || !startSplit.length) break;
      const endSplit = splits[index++];
      if (!endSplit || !endSplit.length) break;
      const maxyMinx = startSplit[startSplit.length - 1]![0]!;
      const maxyMaxx = endSplit[endSplit.length - 1]![0]!;
      const minyMinx = startSplit[0]![0]!;
      const minyMaxx = endSplit[0]![0]!;
      const points = startSplit;

      let remaining: Point[][] = [];
      for (const maxpathPoints of this.maxpath_points as Point[][]) {
        if (maxpathPoints[0]![0]! > maxyMinx && maxpathPoints[maxpathPoints.length - 1]![0]! < maxyMaxx) points.push(...maxpathPoints);
        else remaining.push(maxpathPoints);
      }
      this.maxpath_points = remaining;
      points.push(...[...endSplit].reverse());

      remaining = [];
      for (const minpathPoints of this.minpath_points as Point[][]) {
        if (minpathPoints[0]![0]! < minyMaxx && minpathPoints[minpathPoints.length - 1]![0]! > minyMinx) points.push(...minpathPoints);
        else remaining.push(minpathPoints);
      }
      this.minpath_points = remaining;
      profiles.push(builder.profile(builder.polyline(points, { closed: true, positionOffset: offset })));
    }
    for (const points of [...(this.maxpath_points as Point[][]), ...(this.minpath_points as Point[][])]) {
      profiles.push(builder.profile(builder.polyline(points, { closed: true, positionOffset: offset })));
    }
    const profile = profiles.length > 1 ? this.file.create('IfcCompositeProfileDef', { ProfileType: 'AREA', Profiles: profiles }) : profiles[0]!;
    item = builder.extrude(profile, { magnitude: wallVectors.d, extrusionVector: wallVectors.z });
  }

  for (const boolean of this.getManualBooleans(wall) as Entity[]) {
    boolean.set('FirstOperand', item);
    item = boolean;
  }

  const bodyRep = builder.getRepresentation(this.body, [item]);
  let oldRep = getRepresentation(wall, this.body);
  if (oldRep) {
    replaceElement(oldRep, bodyRep);
    removeDeep2(this.file, oldRep);
  } else {
    assignRepresentation(this.file, wall, bodyRep);
  }

  const axisRep = builder.getRepresentation(this.axis, [builder.polyline([this.reference_p1, this.reference_p2], { positionOffset: offset })]);
  oldRep = getRepresentation(wall, this.axis);
  if (oldRep) {
    replaceElement(oldRep, axisRep);
    removeDeep2(this.file, oldRep);
  } else {
    assignRepresentation(this.file, wall, axisRep);
  }

  if (!allClose(this.reference_p1, [0.0, 0.0]) && !manualBooleans.length) {
    const objectPlacement = wall.get('ObjectPlacement') as Entity;
    const children: [Float64Array, Entity[]][] = [];
    for (const referenced of objectPlacement.get('ReferencedByPlacements') as Entity[]) {
      children.push([getPlacement({ placement: referenced }), referenced.get('PlacesObject') as Entity[]]);
    }
    const matrix = Float64Array.from(getPlacement({ placement: objectPlacement }));
    const column = apply4(matrix, [this.reference_p1[0], this.reference_p1[1], 0, 1]);
    for (let row = 0; row < 4; row++) matrix[row * 4 + 3] = column[row]!;
    editObjectPlacement(this.file, wall, { matrix, isSi: false, shouldTransformChildren: true });
    // The children back to where they were.
    for (const [childMatrix, elements] of children) {
      for (const element of elements) editObjectPlacement(this.file, element, { matrix: childMatrix, isSi: false, shouldTransformChildren: true });
    }
  }
  return bodyRep;
}
