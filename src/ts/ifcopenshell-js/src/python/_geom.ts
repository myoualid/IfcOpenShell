// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// The part of ifcopenshell.geom that ifcopenshell.util and ifcopenshell.api call for placements:
// `ifcopenshell.geom.map_shape(ifcopenshell.geom.settings(), placement).components`, the 4x4
// matrix of an object placement, an IfcPlacement or a cartesian transformation operator, with
// lengths in SI units as the geometry kernel returns them. Composed in JS, so it needs neither
// the geometry kernel nor its schema mapping. Hand-written, unlike the transpiled util/ and api/.

import { calculateUnitScale } from './util/unit.js';

type Matrix = number[][];
type Vector = number[];

const identity = (): Matrix => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

function multiply(a: Matrix, b: Matrix): Matrix {
  return a.map(row => b[0]!.map((_, j) => row.reduce((total, value, k) => total + value * b[k]![j]!, 0)));
}

const pad3 = (values: Iterable<number> | null | undefined, fill = 0): Vector => {
  const items = values ? Array.from(values, Number) : [];
  return [items[0] ?? fill, items[1] ?? fill, items[2] ?? (items.length ? 0 : fill)];
};
const norm = (v: Vector) => Math.hypot(...v);
const scale = (v: Vector, s: number) => v.map(x => x * s);
const sub = (a: Vector, b: Vector) => a.map((x, i) => x - b[i]!);
const dot = (a: Vector, b: Vector) => a.reduce((t, x, i) => t + x * b[i]!, 0);
const cross = (a: Vector, b: Vector): Vector => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const normalise = (v: Vector) => {
  const length = norm(v);
  if (!(length > 0)) throw new Error('ValueError: placement direction has zero length');
  return scale(v, 1 / length);
};
const ratios = (direction: any): Vector => pad3(direction.DirectionRatios);

/** Matrix of an origin, a Z axis and an X axis, the X axis projected onto the plane normal to Z (IfcBuildAxes). */
function axes(origin: Vector, z: Vector, x: Vector): Matrix {
  const zAxis = normalise(z);
  let xAxis = sub(x, scale(zAxis, dot(x, zAxis)));
  if (norm(xAxis) < 1e-12) {
    // Axis parallel to RefDirection: +Z instead, as the geometry kernel does.
    const fallback = norm(cross(zAxis, [1, 0, 0])) ** 2 < 1e-7 ? [0, 0, 1] : [1, 0, 0];
    xAxis = sub(fallback, scale(zAxis, dot(fallback, zAxis)));
  }
  xAxis = normalise(xAxis);
  const yAxis = cross(zAxis, xAxis);
  return [
    [xAxis[0]!, yAxis[0]!, zAxis[0]!, origin[0]!],
    [xAxis[1]!, yAxis[1]!, zAxis[1]!, origin[1]!],
    [xAxis[2]!, yAxis[2]!, zAxis[2]!, origin[2]!],
    [0, 0, 0, 1],
  ];
}

function placement(inst: any): Matrix {
  if (inst.isA('IfcAxis2Placement3D')) {
    return axes(pad3(inst.Location.Coordinates), inst.Axis ? ratios(inst.Axis) : [0, 0, 1], inst.RefDirection ? ratios(inst.RefDirection) : [1, 0, 0]);
  }
  if (inst.isA('IfcAxis2Placement2D')) {
    return axes(pad3(inst.Location.Coordinates), [0, 0, 1], inst.RefDirection ? ratios(inst.RefDirection) : [1, 0, 0]);
  }
  if (inst.isA('IfcAxis1Placement')) {
    // The reference direction the geometry kernel derives (mapping/IfcAxis1Placement.cpp).
    const z = inst.Axis ? ratios(inst.Axis) : [0, 0, 1];
    return axes(pad3(inst.Location.Coordinates), z, cross(Math.abs(z[0]!) > Math.abs(z[2]!) ? [0, 0, 1] : [1, 0, 0], z));
  }
  if (inst.isA('IfcLocalPlacement')) {
    const relative = placement(inst.RelativePlacement);
    return inst.PlacementRelTo ? multiply(placement(inst.PlacementRelTo), relative) : relative;
  }
  if (inst.isA('IfcLinearPlacement')) {
    // The alignment curve is evaluated by the geometry kernel; IFC4X3 files cache the result.
    if (!inst.CartesianPosition) throw new Error('IfcLinearPlacement without a CartesianPosition needs the geometry kernel');
    const relative = placement(inst.CartesianPosition);
    return inst.PlacementRelTo ? multiply(placement(inst.PlacementRelTo), relative) : relative;
  }
  if (inst.isA('IfcGridPlacement')) return gridPlacement(inst);
  if (inst.isA('IfcCartesianTransformationOperator')) return operator(inst);
  throw new Error(`Cannot compute the placement of ${inst.is_a ? inst.is_a() : inst.isA()}`);
}

/** Point and direction of a grid axis (its curve's first segment), in the grid's coordinates. */
function axisLine(axis: any): [Vector, Vector] {
  const curve = axis.AxisCurve;
  let start: Vector, end: Vector;
  if (curve.isA('IfcPolyline')) {
    const points = Array.from(curve.Points as Iterable<any>);
    start = pad3(points[0].Coordinates);
    end = pad3(points[1].Coordinates);
  } else if (curve.isA('IfcLine')) {
    start = pad3(curve.Pnt.Coordinates);
    end = [start[0]! + ratios(curve.Dir.Orientation)[0]!, start[1]! + ratios(curve.Dir.Orientation)[1]!, start[2]!];
  } else if (curve.isA('IfcIndexedPolyCurve')) {
    const points = Array.from(curve.Points.CoordList as Iterable<Iterable<number>>);
    start = pad3(points[0]);
    end = pad3(points[1]);
  } else {
    throw new Error(`Grid axes of type ${curve.is_a()} need the geometry kernel`);
  }
  const direction = normalise(sub(end, start));
  return [start, axis.SameSense === false ? scale(direction, -1) : direction];
}

/** IfcVirtualGridIntersection: where the two axes, each offset sideways by its distance, cross. */
function intersection(virtual: any): Vector {
  const [a, b] = Array.from(virtual.IntersectingAxes as Iterable<any>).map(axisLine);
  const offsets = Array.from((virtual.OffsetDistances ?? []) as Iterable<number>, Number);
  const offsetLine = ([point, direction]: [Vector, Vector], distance = 0): [Vector, Vector] => [
    [point[0]! - direction[1]! * distance, point[1]! + direction[0]! * distance, 0],
    direction,
  ];
  const [p, d] = offsetLine(a!, offsets[0]);
  const [q, e] = offsetLine(b!, offsets[1]);
  const denominator = d[0]! * e[1]! - d[1]! * e[0]!;
  if (Math.abs(denominator) < 1e-12) throw new Error('Grid axes of an IfcVirtualGridIntersection are parallel');
  const t = ((q[0]! - p[0]!) * e[1]! - (q[1]! - p[1]!) * e[0]!) / denominator;
  return [p[0]! + d[0]! * t, p[1]! + d[1]! * t, offsets[2] ?? 0];
}

function gridPlacement(inst: any): Matrix {
  const location = inst.PlacementLocation;
  const firstAxis = Array.from(location.IntersectingAxes as Iterable<any>)[0];
  const grid = [...(firstAxis.PartOfU ?? []), ...(firstAxis.PartOfV ?? []), ...(firstAxis.PartOfW ?? [])][0];
  const origin = intersection(location);
  const reference = inst.PlacementRefDirection;
  let x: Vector;
  if (!reference) x = axisLine(firstAxis)[1];
  else if (reference.isA('IfcDirection')) x = ratios(reference);
  else x = sub(intersection(reference), origin);
  const local = axes(origin, [0, 0, 1], x);
  return grid?.ObjectPlacement ? multiply(placement(grid.ObjectPlacement), local) : local;
}

/** IfcCartesianTransformationOperator2D/3D, uniform or not, as ifcopenshell.util.placement composes it. */
function operator(inst: any): Matrix {
  const origin = pad3(inst.LocalOrigin.Coordinates);
  const given = [inst.Axis1, inst.Axis2, inst.isA('IfcCartesianTransformationOperator3D') ? inst.Axis3 : null];
  const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((axis, i) => (given[i] ? ratios(given[i]) : axis));
  const matrix = axes(origin, basis[2]!, basis[0]!);
  if (dot([matrix[0]![1]!, matrix[1]![1]!, matrix[2]![1]!], basis[1]!) < 0) for (let i = 0; i < 3; i++) matrix[i]![1]! *= -1;
  const s = inst.Scale ?? 1;
  const scales = [s, s, inst.isA('IfcCartesianTransformationOperator3D') ? s : 1];
  if (inst.isA('IfcCartesianTransformationOperator3DnonUniform')) {
    scales[1] = inst.Scale2 ?? s;
    scales[2] = inst.Scale3 ?? s;
  } else if (inst.isA('IfcCartesianTransformationOperator2DnonUniform')) {
    scales[1] = inst.Scale2 ?? s;
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) matrix[i]![j]! *= scales[j]!;
  return matrix;
}

/** `ifcopenshell.geom.map_shape(settings, placement).components`: a row-major 4x4 matrix, translation in metres. */
export function placementComponents(inst: any): Matrix {
  if (inst === null || inst === undefined) return identity();
  const matrix = placement(inst);
  const factor = calculateUnitScale(inst.file());
  for (let i = 0; i < 3; i++) matrix[i]![3]! *= factor;
  return matrix;
}
