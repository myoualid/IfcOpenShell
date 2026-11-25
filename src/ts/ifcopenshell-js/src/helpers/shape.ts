// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.shape functions that use numpy on a triangulation in Python, written by hand with TypedArrays.
// Vertices are a flat Float64Array (x, y, z for each vertex), faces and edges flat Int32Arrays of
// vertex indices (3 for each face, 2 for each edge), as the triangulation buffers give them.
// The generated util/shape re-exports them (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import { getPlacement } from './placement.js';

/** The triangulation buffers that these functions read. */
export interface Triangulation {
  vertsBuffer(): Float64Array;
  facesBuffer(): Int32Array;
  edgesBuffer(): Int32Array;
  normalsBuffer(): Float64Array;
  colorsBuffer(): Float64Array;
  materialIdsBuffer(): Int32Array;
  itemIdsBuffer(): Int32Array;
  edgesItemIdsBuffer(): Int32Array;
}

/** Python util.shape `tol`. */
const TOL = 1e-6;

type Vector3 = [number, number, number];

/** The vertices of a triangulation: x, y, z for each vertex, or x, y with `is2d`. */
export function getVertices(geometry: Triangulation, options: { is2d?: boolean } = {}): Float64Array {
  const verts = geometry.vertsBuffer();
  if (!options.is2d) return verts;
  const result = new Float64Array((verts.length / 3) * 2);
  for (let i = 0, j = 0; i < verts.length; i += 3, j += 2) {
    result[j] = verts[i]!;
    result[j + 1] = verts[i + 1]!;
  }
  return result;
}

/** The edges of a triangulation: two vertex indices for each edge. */
export function getEdges(geometry: Triangulation): Int32Array {
  return geometry.edgesBuffer();
}

/** The faces of a triangulation: three vertex indices for each triangle. */
export function getFaces(geometry: Triangulation): Int32Array {
  return geometry.facesBuffer();
}

function point(vertices: Float64Array, index: number): Vector3 {
  return [vertices[index * 3]!, vertices[index * 3 + 1]!, vertices[index * 3 + 2]!];
}

/** The cross product (b - a) × (c - a) of a triangle: its normal, with twice its area as length. */
function triangleNormal(vertices: Float64Array, faces: ArrayLike<number>, face: number): Vector3 {
  const a = point(vertices, faces[face * 3]!);
  const b = point(vertices, faces[face * 3 + 1]!);
  const c = point(vertices, faces[face * 3 + 2]!);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
}

/** The faces whose unit normal passes `test`. A degenerate triangle has no normal and never passes. */
function selectFaces(vertices: Float64Array, faces: Int32Array, test: (normal: Vector3) => boolean): Int32Array {
  const selected: number[] = [];
  for (let face = 0; face < faces.length / 3; face++) {
    const n = triangleNormal(vertices, faces, face);
    const length = Math.hypot(n[0], n[1], n[2]);
    if (test([n[0] / length, n[1] / length, n[2] / length])) selected.push(faces[face * 3]!, faces[face * 3 + 1]!, faces[face * 3 + 2]!);
  }
  return Int32Array.from(selected);
}

/** The total area of the triangles of a mesh. */
export function getAreaVf(vertices: Float64Array, faces: ArrayLike<number>): number {
  let area = 0;
  for (let face = 0; face < faces.length / 3; face++) {
    const n = triangleNormal(vertices, faces, face);
    area += Math.hypot(n[0], n[1], n[2]) / 2;
  }
  return area;
}

/** The total surface area of a triangulation. */
export function getArea(geometry: Triangulation): number {
  return getAreaVf(getVertices(geometry), getFaces(geometry));
}

/** The volume enclosed by a closed triangulation, from the signed volumes of its triangles. */
export function getVolume(geometry: Triangulation): number {
  const vertices = getVertices(geometry);
  const faces = getFaces(geometry);
  let volume = 0;
  for (let face = 0; face < faces.length / 3; face++) {
    const p1 = point(vertices, faces[face * 3]!);
    const p2 = point(vertices, faces[face * 3 + 1]!);
    const p3 = point(vertices, faces[face * 3 + 2]!);
    volume += (1 / 6) * (
      -p3[0] * p2[1] * p1[2] + p2[0] * p3[1] * p1[2] + p3[0] * p1[1] * p2[2]
      - p1[0] * p3[1] * p2[2] - p2[0] * p1[1] * p3[2] + p1[0] * p2[1] * p3[2]
    );
  }
  return Math.abs(volume);
}

const AXES: Record<'X' | 'Y' | 'Z', Vector3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

/**
 * The area of the triangles that face `direction` (or `axis`) within `angle` degrees, with a
 * tolerance of 0.01 on the cosine.
 */
export function getSideArea(
  geometry: Triangulation,
  options: { axis?: 'X' | 'Y' | 'Z'; direction?: ArrayLike<number> | null; angle?: number } = {},
): number {
  const { axis = 'Y', direction = null, angle = 90 } = options;
  const d = direction ? [direction[0]!, direction[1]!, direction[2]!] : AXES[axis];
  const length = Math.hypot(d[0]!, d[1]!, d[2]!);
  const unit = [d[0]! / length, d[1]! / length, d[2]! / length];
  const acceptable = Math.cos((angle * Math.PI) / 180) + 0.01;
  const vertices = getVertices(geometry);
  const faces = selectFaces(vertices, getFaces(geometry), n => n[0] * unit[0]! + n[1] * unit[1]! + n[2] * unit[2]! > acceptable);
  return getAreaVf(vertices, faces);
}

/** The largest of the side areas along X, Y and Z. */
export function getMaxSideArea(geometry: Triangulation): number {
  return Math.max(getSideArea(geometry, { axis: 'X' }), getSideArea(geometry, { axis: 'Y' }), getSideArea(geometry, { axis: 'Z' }));
}

/** The area of the triangles that do not face +Z or -Z. */
export function getOuterSurfaceArea(geometry: Triangulation): number {
  const vertices = getVertices(geometry);
  return getAreaVf(vertices, selectFaces(vertices, getFaces(geometry), n => Math.abs(n[2]) < TOL));
}

/** The length of the outline of the triangles that face -Z: the edges that no two of them share. */
export function getFootprintPerimeter(geometry: Triangulation): number {
  const vertices = getVertices(geometry);
  const faces = selectFaces(vertices, getFaces(geometry), n => n[2] < -TOL);
  const all = new Map<string, [number, number]>();
  const shared = new Set<string>();
  for (let face = 0; face < faces.length / 3; face++) {
    for (let i = 0; i < 3; i++) {
      const a = faces[face * 3 + i]!;
      const b = faces[face * 3 + ((i + 1) % 3)]!;
      if (all.has(`${b},${a}`) || all.has(`${a},${b}`)) {
        shared.add(`${a},${b}`);
        shared.add(`${b},${a}`);
      } else {
        all.set(`${a},${b}`, [a, b]);
      }
    }
  }
  let perimeter = 0;
  for (const [key, [a, b]] of all) {
    if (shared.has(key)) continue;
    const p = point(vertices, a);
    const q = point(vertices, b);
    perimeter += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return perimeter;
}

/** The total length of the edges of a triangulation. */
export function getTotalEdgeLength(geometry: Triangulation): number {
  const vertices = getVertices(geometry);
  const edges = getEdges(geometry);
  let length = 0;
  for (let i = 0; i < edges.length; i += 2) {
    const p = point(vertices, edges[i]!);
    const q = point(vertices, edges[i + 1]!);
    length += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return length;
}

/** The extent (largest minus smallest value) of one coordinate (0: X, 1: Y, 2: Z) of flat x, y, z vertices. */
function extent(vertices: Float64Array, axis: number): [number, number] {
  let [low, high] = [Infinity, -Infinity];
  for (let i = axis; i < vertices.length; i += 3) {
    low = Math.min(low, vertices[i]!);
    high = Math.max(high, vertices[i]!);
  }
  return [low, high];
}

/** The X length of a triangulation. */
export function getX(geometry: Triangulation): number {
  const [low, high] = extent(getVertices(geometry), 0);
  return high - low;
}

/** The Y length of a triangulation. */
export function getY(geometry: Triangulation): number {
  const [low, high] = extent(getVertices(geometry), 1);
  return high - low;
}

/** The Z length of a triangulation. */
export function getZ(geometry: Triangulation): number {
  const [low, high] = extent(getVertices(geometry), 2);
  return high - low;
}

/** The lowest local Z of a triangulation. */
export function getBottomElevation(geometry: Triangulation): number {
  return extent(getVertices(geometry), 2)[0];
}

/** The highest local Z of a triangulation. */
export function getTopElevation(geometry: Triangulation): number {
  return extent(getVertices(geometry), 2)[1];
}

/** The corners of the bounding box of flat x, y, z vertices: [min x, min y, min z] and [max x, max y, max z]. */
export function getBbox(vertices: Float64Array): [Float64Array, Float64Array] {
  const low = new Float64Array(3);
  const high = new Float64Array(3);
  for (let axis = 0; axis < 3; axis++) [low[axis], high[axis]] = extent(vertices, axis);
  return [low, high];
}

/** The centre of the bounding box of a triangulation, in its local coordinates. */
export function getBboxCentroid(geometry: Triangulation): Float64Array {
  const [low, high] = getBbox(getVertices(geometry));
  return Float64Array.from([0, 1, 2], axis => (low[axis]! + high[axis]!) / 2);
}

/** The mean of the vertices of a triangulation, in its local coordinates. */
export function getVertCentroid(geometry: Triangulation): Float64Array {
  const vertices = getVertices(geometry);
  const count = vertices.length / 3;
  const sum = new Float64Array(3);
  for (let i = 0; i < vertices.length; i++) sum[i % 3] += vertices[i]!;
  return sum.map(value => value / count);
}

/** A shape element of the geometry iterator or createShape: its placement as 16 values, column by column. */
export interface ShapeElement {
  transformationBuffer(): Float64Array;
}

/** The 4x4 placement matrix of a shape, row-major (m[row * 4 + column]). */
export function getShapeMatrix(shape: ShapeElement): Float64Array {
  const buffer = shape.transformationBuffer();
  const matrix = new Float64Array(16);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) matrix[row * 4 + column] = buffer[column * 4 + row]!;
  }
  return matrix;
}

/** Flat x, y, z points moved by a row-major 4x4 matrix. */
function transformed(matrix: ArrayLike<number>, points: Float64Array): Float64Array {
  const result = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    const [x, y, z] = [points[i]!, points[i + 1]!, points[i + 2]!];
    for (let row = 0; row < 3; row++) {
      result[i + row] = matrix[row * 4]! * x + matrix[row * 4 + 1]! * y + matrix[row * 4 + 2]! * z + matrix[row * 4 + 3]!;
    }
  }
  return result;
}

/** The placement of an element as a matrix, or null when it has no IfcLocalPlacement. */
function elementMatrix(element: EntityInstance, isSi: boolean): Float64Array | null {
  const placement = element.get('ObjectPlacement') as EntityInstance | null;
  if (!placement || !placement.isA('IfcLocalPlacement')) return null;
  return getPlacement({ placement, shouldReturnSi: isSi });
}

/** The centre of the bounding box of a shape, in global coordinates. */
export function getShapeBboxCentroid(shape: ShapeElement, geometry: Triangulation): Float64Array {
  return transformed(getShapeMatrix(shape), getBboxCentroid(geometry));
}

/** The centre of the bounding box of an element, in global coordinates (in SI units with `isSi`). */
export function getElementBboxCentroid(element: EntityInstance, geometry: Triangulation, options: { isSi?: boolean } = {}): Float64Array {
  const { isSi = true } = options;
  const centroid = getBboxCentroid(geometry);
  const matrix = elementMatrix(element, isSi);
  return matrix ? transformed(matrix, centroid) : centroid;
}

/** The vertices of a shape in global coordinates: x, y, z for each vertex. */
export function getShapeVertices(shape: ShapeElement, geometry: Triangulation): Float64Array {
  return transformed(getShapeMatrix(shape), getVertices(geometry));
}

/** The vertices of an element in global coordinates (in SI units with `isSi`): x, y, z for each vertex. */
export function getElementVertices(element: EntityInstance, geometry: Triangulation, options: { isSi?: boolean } = {}): Float64Array {
  const { isSi = true } = options;
  const vertices = getVertices(geometry);
  const matrix = elementMatrix(element, isSi);
  return matrix ? transformed(matrix, vertices) : vertices;
}

/** The lowest global Z of a shape. */
export function getShapeBottomElevation(shape: ShapeElement, geometry: Triangulation): number {
  return extent(getShapeVertices(shape, geometry), 2)[0];
}

/** The highest global Z of a shape. */
export function getShapeTopElevation(shape: ShapeElement, geometry: Triangulation): number {
  return extent(getShapeVertices(shape, geometry), 2)[1];
}

/** The lowest global Z of an element. */
export function getElementBottomElevation(element: EntityInstance, geometry: Triangulation, options: { isSi?: boolean } = {}): number {
  return extent(getElementVertices(element, geometry, options), 2)[0];
}

/** The highest global Z of an element. */
export function getElementTopElevation(element: EntityInstance, geometry: Triangulation, options: { isSi?: boolean } = {}): number {
  return extent(getElementVertices(element, geometry, options), 2)[1];
}

/** The material colours of a triangulation: r, g, b, a for each material. */
export function getMaterialColors(geometry: Triangulation): Float64Array {
  return geometry.colorsBuffer();
}

/** The vertex normals of a triangulation: x, y, z for each vertex. */
export function getNormals(geometry: Triangulation): Float64Array {
  return geometry.normalsBuffer();
}

/** For each face, the index of its style in the materials of the triangulation, or -1. */
export function getFacesMaterialStyleIds(geometry: Triangulation): Int32Array {
  return geometry.materialIdsBuffer();
}

/** For each face, the id of its representation item. */
export function getFacesRepresentationItemIds(geometry: Triangulation): Int32Array {
  return geometry.itemIdsBuffer();
}

/** For each edge, the id of its representation item. */
export function getEdgesRepresentationItemIds(geometry: Triangulation): Int32Array {
  return geometry.edgesItemIdsBuffer();
}

/** A segment of x, y (or x, y, z) points made longer by `distance` at both ends. */
export function _extendLine(start: ArrayLike<number>, end: ArrayLike<number>, distance: number): [Float64Array, Float64Array] {
  const d = Float64Array.from(end, (value, i) => value - start[i]!);
  const length = Math.hypot(...d);
  if (length === 0) return [Float64Array.from(start), Float64Array.from(end)];
  return [
    Float64Array.from(start, (value, i) => value - (distance * d[i]!) / length),
    Float64Array.from(end, (value, i) => value + (distance * d[i]!) / length),
  ];
}
