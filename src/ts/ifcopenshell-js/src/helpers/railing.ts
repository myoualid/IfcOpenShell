// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.geometry.add_railing_representation, which uses numpy in Python (also at module level),
// written by hand with Float64Array vectors. The generated api/geometry/add_railing_representation
// re-exports this module (see `hand_written_modules` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import type { File } from '../file.js';
import { calculateUnitScale } from '../util/unit.js';
import { ShapeBuilder } from '../util/shape_builder.js';
import { npAngle, npAngleSigned, npIntersectLineLine, npLerp, npNormal, npNormalized, type VectorLike } from './shape_builder.js';

export type TERMINAL_TYPE = '180' | 'TO_END_POST' | 'TO_WALL' | 'TO_FLOOR' | 'TO_END_POST_AND_FLOOR' | 'NONE';

export const TERMINAL_RADIUS_MM = 150;
export const HANDRAIL_FILLET_RADIUS_MM = 100;
export const SUPPORT_ARC_RADIUS_MM = 10;
export const SUPPORT_DISK_DEPTH_MM = 20;
export const DEFAULT_SUPPORT_SPACING_MM = 1000;
export const DEFAULT_RAILING_DIAMETER_MM = 50;
export const DEFAULT_CLEAR_WIDTH_MM = 40;
export const DEFAULT_HEIGHT_MM = 1000;

/** util.shape_builder PRECISION. */
const PRECISION = 1.0e-5;

type Vector = Float64Array;

const mm = (value: number): number => value / 1000;
const vector = (x: number, y: number, z: number): Vector => new Float64Array([x, y, z]);
const add = (a: VectorLike, b: VectorLike): Vector => Float64Array.from(a, (x, i) => x + b[i]!);
const sub = (a: VectorLike, b: VectorLike): Vector => Float64Array.from(a, (x, i) => x - b[i]!);
const scale = (a: VectorLike, k: number): Vector => Float64Array.from(a, x => x * k);
const cross = (a: VectorLike, b: VectorLike): Vector =>
  vector(a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!);
const norm = (a: VectorLike): number => Math.hypot(...Array.from(a));
const finite = (a: VectorLike): boolean => Array.from(a).every(Number.isFinite);
/** numpy allclose with its default tolerances. */
const allclose = (a: VectorLike, b: VectorLike): boolean => Array.from(a).every((x, i) => Math.abs(x - b[i]!) <= 1e-8 + 1e-5 * Math.abs(b[i]!));

const Z_DOWN = vector(0, 0, -1);
const ARC_MIDDLE_POINT_COS = Math.sin((45 * Math.PI) / 180);

/** A wall support of a handrail: an arc from the handrail to the wall, and a disk on the wall. */
export interface RailingSupport {
  arcPolyline: Vector[];
  arcRadius: number;
  diskPosition: Vector;
  diskRadius: number;
  diskDepth: number;
  diskZRotation: number;
}

/** The geometry of a wall mounted handrail, before it is made into IFC items. */
export interface WallMountedHandrailGeometry {
  handrailPolyline: Vector[];
  handrailArcPointIndices: number[];
  handrailRadius: number;
  supports: RailingSupport[];
}

interface RailingDims {
  railingRadius: number;
  heightBelowHandrail: number;
  terminalRadius: number;
  filletRadius: number;
  supportSpacing: number;
  supportLength: number;
  supportArcRadius: number;
  supportDiskRadius: number;
  supportDiskDepth: number;
  clearWidth: number;
  capType: TERMINAL_TYPE;
}

function collinear(d0: VectorLike, d1: VectorLike): boolean {
  return norm(cross(d0, d1)) < PRECISION;
}

/** The start, middle and end of the fillet arc of `radius` at the corner v1 of v0, v1, v2. */
function filletPoints(v0: Vector, v1: Vector, v2: Vector, radius: number): Vector[] {
  const dir1 = npNormalized(sub(v0, v1));
  const dir2 = npNormalized(sub(v2, v1));
  const slide = radius / Math.tan(npAngle(dir1, dir2) / 2);
  const start = add(v1, scale(dir1, slide));
  const end = add(v1, scale(dir2, slide));
  const normal = npNormal([v0, v1, v2]);
  const center = npIntersectLineLine(start, add(start, cross(normal, dir1)), end, add(end, cross(normal, dir2)))[0];
  const direction = npNormalized(sub(npLerp(start, end, 0.5), center));
  return [start, add(center, scale(direction, radius)), end];
}

function makeSupport(point: Vector, railingDirection: VectorLike, dims: RailingDims): RailingSupport {
  const ortho = npNormalized(vector(railingDirection[1]!, -railingDirection[0]!, 0));
  const length = dims.supportLength;
  const arcCenter = add(point, scale(ortho, length));
  const middle = add(sub(arcCenter, scale(ortho, length * Math.cos(Math.PI / 4))), scale(Z_DOWN, length * Math.sin(Math.PI / 4)));
  const arcPolyline = [point, middle, add(arcCenter, scale(Z_DOWN, length))];
  return {
    arcPolyline,
    arcRadius: dims.supportArcRadius,
    diskPosition: arcPolyline[2]!,
    diskRadius: dims.supportDiskRadius,
    diskDepth: dims.supportDiskDepth,
    diskZRotation: npAngleSigned([0, 1], [ortho[0]!, ortho[1]!]),
  };
}

/** The points with fillet arcs at the corners, and the middle points of these arcs. */
function addArcsOnTurningPoints(base: Vector[], dims: RailingDims, loopedPath: boolean): [Vector[], Vector[]] {
  const arcPoints: Vector[] = [];
  if (base.length < 3) return [base, arcPoints];
  const output: Vector[] = [base[0]!];
  let previous = npNormalized(sub(base[1]!, base[0]!));
  for (let i = 1; i < base.length - 1; i++) {
    const current = npNormalized(sub(base[i + 1]!, base[i]!));
    const degenerate = !finite(current);
    if (degenerate || collinear(current, previous)) {
      output.push(base[i]!);
    } else {
      const fillet = filletPoints(base[i - 1]!, base[i]!, base[i + 1]!, dims.filletRadius);
      if (fillet.every(finite)) {
        output.push(...fillet);
        arcPoints.push(fillet[1]!);
      } else {
        output.push(base[i]!);
      }
    }
    if (!degenerate) previous = current;
  }
  if (loopedPath) output[0] = output[output.length - 1]!;
  else output.push(base[base.length - 1]!);
  return [output, arcPoints];
}

function collectSupports(coords: Vector[], manualSupports: boolean, dims: RailingDims): RailingSupport[] {
  const supports: RailingSupport[] = [];
  const simplified: Vector[] = [coords[0]!];
  let previous = npNormalized(sub(coords[1]!, coords[0]!));
  for (let i = 1; i < coords.length - 1; i++) {
    const current = npNormalized(sub(coords[i + 1]!, coords[i]!));
    if (!collinear(current, previous)) {
      simplified.push(coords[i]!);
      previous = current;
    } else if (manualSupports) {
      supports.push(makeSupport(coords[i]!, current, dims));
    }
  }
  simplified.push(coords[coords.length - 1]!);
  if (manualSupports) return supports;
  for (let i = 0; i < simplified.length - 1; i++) {
    const edge = sub(simplified[i + 1]!, simplified[i]!);
    const length = norm(edge);
    const direction = npNormalized(edge);
    const count = Math.floor(length / dims.supportSpacing);
    const offset = (length - count * dims.supportSpacing) / 2;
    const start = add(simplified[i]!, scale(direction, offset));
    for (let j = 0; j <= count; j++) supports.push(makeSupport(add(start, scale(direction, j * dims.supportSpacing)), edge, dims));
  }
  return supports;
}

type CapBuilder = (coords: Vector[], start: Vector, capDir: Vector, orthoDir: Vector, localZDown: Vector, dims: RailingDims) => [Vector[], Vector[]];

const CAP_BUILDERS: Record<Exclude<TERMINAL_TYPE, 'NONE'>, CapBuilder> = {
  '180': (coords, start, capDir, orthoDir, down, dims) => {
    const arc = add(add(start, scale(capDir, dims.terminalRadius)), scale(down, dims.terminalRadius));
    return [[arc, add(start, scale(down, dims.terminalRadius * 2))], [arc]];
  },
  TO_END_POST: (coords, start, capDir, orthoDir, down, dims) => {
    const arc = add(add(start, scale(capDir, dims.terminalRadius)), scale(down, dims.terminalRadius));
    const end = Float64Array.from(coords[coords.length - 2]!);
    end[2] = end[2]! - dims.terminalRadius * 2;
    return [[arc, add(start, scale(down, dims.terminalRadius * 2)), end], [arc]];
  },
  TO_WALL: (coords, start, capDir, orthoDir, down, dims) => {
    const arc = add(add(start, scale(capDir, dims.clearWidth * ARC_MIDDLE_POINT_COS)), scale(orthoDir, dims.clearWidth * (1 - ARC_MIDDLE_POINT_COS)));
    return [[arc, add(add(start, scale(orthoDir, dims.clearWidth)), scale(capDir, dims.clearWidth))], [arc]];
  },
  TO_FLOOR: (coords, start, capDir, orthoDir, down, dims) => {
    const arc = add(add(start, scale(capDir, dims.terminalRadius * ARC_MIDDLE_POINT_COS)), scale(Z_DOWN, dims.terminalRadius * (1 - ARC_MIDDLE_POINT_COS)));
    const arcEnd = add(add(start, scale(capDir, dims.terminalRadius)), scale(Z_DOWN, dims.terminalRadius));
    return [[arc, arcEnd, add(arcEnd, scale(Z_DOWN, dims.heightBelowHandrail - dims.terminalRadius))], [arc]];
  },
  TO_END_POST_AND_FLOOR: (coords, start, capDir, orthoDir, down, dims) => {
    const firstEnd = add(add(start, scale(capDir, dims.terminalRadius)), scale(down, dims.terminalRadius));
    const first = filletPoints(start, add(start, scale(capDir, dims.terminalRadius)), firstEnd, dims.terminalRadius);
    const end = Float64Array.from(coords[coords.length - 2]!);
    end[2] = end[2]! - dims.heightBelowHandrail;
    const second = filletPoints(firstEnd, add(firstEnd, scale(down, dims.terminalRadius)), end, dims.terminalRadius);
    return [[start, ...first, ...second, end], [first[1]!, second[1]!]];
  },
};

function addCap(coords: Vector[], arcPoints: Vector[], start: boolean, dims: RailingDims): [Vector[], Vector[]] {
  if (dims.capType === 'NONE') return [coords, arcPoints];
  const forCap = start ? [...coords].reverse() : coords;
  let arcs = start ? [...arcPoints].reverse() : [...arcPoints];
  const startPoint = forCap[forCap.length - 1]!;
  const capDir = npNormalized(sub(startPoint, forCap[forCap.length - 2]!));
  let orthoDir = npNormalized(vector(capDir[1]!, -capDir[0]!, 0));
  const localZDown = cross(capDir, orthoDir);
  if (start) orthoDir = scale(orthoDir, -1);
  const [capCoords, newArcs] = CAP_BUILDERS[dims.capType](forCap, startPoint, capDir, orthoDir, localZDown, dims);
  arcs.push(...newArcs);
  let result = [...forCap, ...capCoords];
  if (start) {
    result = result.reverse();
    arcs = arcs.reverse();
  }
  return [result, arcs];
}

/** The index in `points` of each arc middle point, in order. */
function arcIndices(points: Vector[], arcPoints: Vector[]): number[] {
  const indices: number[] = [];
  let from = 0;
  for (const arcPoint of arcPoints) {
    const found = points.findIndex((point, i) => i >= from && allclose(arcPoint, point));
    if (found < 0) throw new Error(`Arc point '${Array.from(arcPoint)}' is not present in points`);
    indices.push(found);
    from = found + 1;
  }
  return indices;
}

/** The handrail polyline (with arcs) and the supports of a wall mounted handrail along `railingPath`. */
export function computeWallMountedHandrailGeometry(options: {
  railingPath: ArrayLike<VectorLike>;
  supportSpacing: number;
  railingDiameter: number;
  clearWidth: number;
  height: number;
  useManualSupports?: boolean;
  terminalType?: TERMINAL_TYPE;
  loopedPath?: boolean;
  unitScale?: number;
}): WallMountedHandrailGeometry {
  const { useManualSupports = false, terminalType = '180', loopedPath = false, unitScale = 1 } = options;
  const railingRadius = options.railingDiameter / 2;
  let coords = Array.from(options.railingPath, p => sub(p, scale(Z_DOWN, railingRadius)));
  const dims: RailingDims = {
    railingRadius,
    heightBelowHandrail: options.height - railingRadius,
    terminalRadius: mm(TERMINAL_RADIUS_MM) / unitScale,
    filletRadius: mm(HANDRAIL_FILLET_RADIUS_MM) / unitScale,
    supportSpacing: options.supportSpacing,
    supportLength: options.clearWidth + railingRadius,
    supportArcRadius: mm(SUPPORT_ARC_RADIUS_MM) / unitScale,
    supportDiskRadius: railingRadius,
    supportDiskDepth: mm(SUPPORT_DISK_DEPTH_MM) / unitScale,
    clearWidth: options.clearWidth,
    capType: terminalType,
  };
  if (loopedPath) coords = [...coords, ...coords.slice(0, 2)];
  const supports = collectSupports(coords, useManualSupports, dims);
  let arcPoints: Vector[];
  [coords, arcPoints] = addArcsOnTurningPoints(coords, dims, loopedPath);
  if (!loopedPath) {
    [coords, arcPoints] = addCap(coords, arcPoints, true, dims);
    [coords, arcPoints] = addCap(coords, arcPoints, false, dims);
  }
  return { handrailPolyline: coords, handrailArcPointIndices: arcIndices(coords, arcPoints), handrailRadius: railingRadius, supports };
}

/**
 * A Body representation of a wall mounted handrail along `railingPath` (project units), with its
 * supports. Sizes that are left out take their millimetre defaults.
 */
export function addRailingRepresentation(
  file: File,
  options: {
    context: EntityInstance;
    railingPath?: ArrayLike<VectorLike> | null;
    useManualSupports?: boolean;
    supportSpacing?: number | null;
    railingDiameter?: number | null;
    clearWidth?: number | null;
    terminalType?: TERMINAL_TYPE;
    height?: number | null;
    loopedPath?: boolean;
    unitScale?: number | null;
  },
): EntityInstance {
  const unitScale = options.unitScale ?? calculateUnitScale(file);
  const orDefault = (value: number | null | undefined, defaultMm: number) => value ?? mm(defaultMm) / unitScale;
  const railingPath = options.railingPath ?? [vector(0, 0, 1), vector(1, 0, 1), vector(2, 0, 1)].map(p => scale(p, 1 / unitScale));
  const geometry = computeWallMountedHandrailGeometry({
    railingPath,
    useManualSupports: options.useManualSupports ?? false,
    supportSpacing: orDefault(options.supportSpacing, DEFAULT_SUPPORT_SPACING_MM),
    railingDiameter: orDefault(options.railingDiameter, DEFAULT_RAILING_DIAMETER_MM),
    clearWidth: orDefault(options.clearWidth, DEFAULT_CLEAR_WIDTH_MM),
    terminalType: options.terminalType ?? '180',
    height: orDefault(options.height, DEFAULT_HEIGHT_MM),
    loopedPath: options.loopedPath ?? false,
    unitScale,
  });
  const builder = new ShapeBuilder(file);
  const items: EntityInstance[] = [];
  for (const support of geometry.supports) {
    const arc = builder.polyline(support.arcPolyline, { closed: false, arcPoints: [1] });
    items.push(builder.createSweptDiskSolid(arc, support.arcRadius));
    const disk = builder.circle({ radius: support.diskRadius });
    const axes = builder.rotateExtrusionKwargsByZ(builder.extrudeKwargs('Y'), support.diskZRotation);
    items.push(builder.extrude(disk, {
      magnitude: support.diskDepth,
      position: support.diskPosition,
      positionXAxis: axes.position_x_axis,
      positionZAxis: axes.position_z_axis,
      extrusionVector: axes.extrusion_vector,
    }));
  }
  const handrail = builder.polyline(geometry.handrailPolyline, { closed: false, arcPoints: geometry.handrailArcPointIndices });
  items.push(builder.createSweptDiskSolid(handrail, geometry.handrailRadius));
  return builder.getRepresentation(options.context, items);
}
