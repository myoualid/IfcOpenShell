// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.alignment functions that read 4x4 numpy matrices in Python, written by hand with the
// row-major Float64Array matrices of helpers/placement.ts (m[row * 4 + column] is numpy m[row, column]).
// The generated api/alignment modules re-export them (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import type { File } from '../file.js';
import { _updateCurveSegmentTransitionCode } from '../api/alignment/_update_curve_segment_transition_code.js';
import { assignObject } from '../api/nest/assign_object.js';
import * as guid from '../guid.js';
import { getLayout } from '../api/alignment/get_layout.js';
import { hasZeroLengthSegment } from '../api/alignment/has_zero_length_segment.js';
import { calculateUnitScale } from '../util/unit.js';
import { getPlacement } from './placement.js';
import { _mapAlignmentSegment } from '../api/alignment/_map_alignment_segment.js';
import { createShape, functionItemEvaluator, functionItemRange, mapShape, Settings } from '../geom/index.js';
import type { IfcOpenshellGeomFunctionItemEvaluator, IfcOpenshellGeomTriangulation } from '@ifcopenshell/wasm/api';

type Entity = EntityInstance;

const at = (m: ArrayLike<number>, row: number, column: number): number => m[row * 4 + column]!;

function entity(owner: Entity, name: string): Entity {
  return owner.get(name) as Entity;
}

/** The direction attribute `name` of `owner`, created with `initial` ratios when it is not set. */
function direction(file: File, owner: Entity, name: string, initial: number[]): Entity {
  let value = owner.get(name) as Entity | null;
  if (!value) {
    value = file.create('IfcDirection', { DirectionRatios: initial });
    owner.set(name, value);
  }
  return value;
}

/** The cosine and sine of the cross slope of a cant placement: the X and Z axes of a 4x4 matrix. */
export function _cantCrossSlope(placement: ArrayLike<number>): [number, number] {
  const [rdx, rdz] = [at(placement, 0, 0), at(placement, 2, 0)];
  const [adx, ady, adz] = [at(placement, 0, 2), at(placement, 1, 2), at(placement, 2, 2)];
  const [cos, sin] = [ady, rdx * adz - rdz * adx];
  const length = Math.hypot(cos, sin);
  return [cos / length, sin / length];
}

/** Moves a zero length segment (curve segment or design parameters) to the 4x4 matrix `placement` (SI units). */
export function _updateZeroLengthSegmentPlacement(file: File, zeroLengthSegment: Entity, placement: ArrayLike<number>): void {
  const unitScale = calculateUnitScale(file);
  const [x, y, z] = [at(placement, 0, 3) / unitScale, at(placement, 1, 3) / unitScale, at(placement, 2, 3) / unitScale];
  const [rdx, rdy, rdz] = [at(placement, 0, 0), at(placement, 1, 0), at(placement, 2, 0)];
  if (zeroLengthSegment.isA('IfcCurveSegment')) {
    const local = entity(zeroLengthSegment, 'Placement');
    if (local.isA('IfcAxis2Placement2D')) {
      entity(local, 'Location').set('Coordinates', [x, y]);
      entity(local, 'RefDirection').set('DirectionRatios', [rdx, rdy]);
    } else {
      const [cos, sin] = _cantCrossSlope(placement);
      entity(local, 'Location').set('Coordinates', [x, y, z]);
      entity(local, 'RefDirection').set('DirectionRatios', [rdx, rdz, 0]);
      entity(local, 'Axis').set('DirectionRatios', [0, cos, sin]);
    }
    return;
  }
  const parameters = entity(zeroLengthSegment, 'DesignParameters');
  if (parameters.isA('IfcAlignmentHorizontalSegment')) {
    entity(parameters, 'StartPoint').set('Coordinates', [x, y]);
    parameters.set('StartDirection', Math.atan(rdy / rdx));
  } else if (parameters.isA('IfcAlignmentVerticalSegment')) {
    parameters.set('StartDistAlong', x);
    parameters.set('StartHeight', y);
    parameters.set('StartGradient', rdy / rdx);
    parameters.set('EndGradient', rdy / rdx);
  } else {
    const [slope] = _cantCrossSlope(placement);
    const railhead = getLayout(zeroLengthSegment).get('RailHeadDistance') as number;
    parameters.set('StartDistAlong', x);
    parameters.set('StartCantLeft', y - (slope * railhead) / 2);
    parameters.set('StartCantRight', y + (slope * railhead) / 2);
    parameters.set('EndCantLeft', parameters.get('StartCantLeft'));
    parameters.set('EndCantRight', parameters.get('StartCantRight'));
  }
}

/** Sets the EndPoint of a gradient or segmented reference curve to the placement of its zero length segment. */
export function updateEndPoint(file: File, curve: Entity): void {
  const expected = ['IfcGradientCurve', 'IfcSegmentedReferenceCurve'];
  if (!expected.includes(curve.isA())) {
    throw new TypeError(`Expected entity type to be one of ${expected}, instead received '${curve.isA()}`);
  }
  if (!hasZeroLengthSegment(curve)) addZeroLengthSegment(file, curve);
  const segments = curve.get('Segments') as Entity[];
  const zeroLengthSegment = segments[segments.length - 1]!;
  const gradient = curve.isA('IfcGradientCurve');
  if (!curve.get('EndPoint')) {
    curve.set('EndPoint', gradient
      ? file.create('IfcAxis2Placement2D', {
        Location: file.create('IfcCartesianPoint', { Coordinates: [0, 0] }),
        RefDirection: file.create('IfcDirection', { DirectionRatios: [1, 0] }),
      })
      : file.create('IfcAxis2Placement3D', {
        Location: file.create('IfcCartesianPoint', { Coordinates: [0, 0, 0] }),
        RefDirection: file.create('IfcDirection', { DirectionRatios: [1, 0, 0] }),
        Axis: file.create('IfcDirection', { DirectionRatios: [0, 0, 1] }),
      }));
  }
  const p = getPlacement({ placement: entity(zeroLengthSegment, 'Placement') });
  const end = entity(curve, 'EndPoint');
  if (gradient) {
    entity(end, 'Location').set('Coordinates', [at(p, 0, 3), at(p, 1, 3)]);
    direction(file, end, 'RefDirection', [1, 0]).set('DirectionRatios', [at(p, 0, 0), at(p, 1, 0)]);
  } else {
    entity(end, 'Location').set('Coordinates', [at(p, 0, 3), at(p, 1, 3), at(p, 2, 3)]);
    direction(file, end, 'RefDirection', [1, 0, 0]).set('DirectionRatios', [at(p, 0, 0), at(p, 1, 0), at(p, 2, 0)]);
    direction(file, end, 'Axis', [0, 0, 1]).set('DirectionRatios', [at(p, 0, 2), at(p, 1, 2), at(p, 2, 2)]);
  }
}

/** numpy.allclose of two vectors of the same length: |a - b| <= atol + rtol * |b| for each value. */
function allClose(a: ArrayLike<number>, b: ArrayLike<number>, atol = 1e-8, rtol = 1e-5): boolean {
  for (let i = 0; i < a.length; i++) {
    if (!(Math.abs(a[i]! - b[i]!) <= atol + rtol * Math.abs(b[i]!))) return false;
  }
  return true;
}

/** The 4x4 matrix of the function item of `instance` at a distance along it, as the wrapper gives it: row-major. */
function matrixAt(settings: Settings, instance: Entity, distance: (range: [number, number]) => number): Float64Array {
  const item = mapShape(settings, instance);
  let evaluator: IfcOpenshellGeomFunctionItemEvaluator | null = null;
  try {
    evaluator = functionItemEvaluator(settings, item);
    return Float64Array.from(evaluator.evaluateAt(distance(functionItemRange(item))));
  } finally {
    evaluator?.destroy();
    item.destroy();
  }
}

function transposed(m: ArrayLike<number>): Float64Array {
  const result = new Float64Array(16);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) result[row * 4 + column] = m[column * 4 + row]!;
  }
  return result;
}

const REPRESENTATION_TYPES = ['IFCCOMPOSITECURVE', 'IFCGRADIENTCURVE', 'IFCSEGMENTEDREFERENCECURVE'];

function checkRepresentationType(shapeRep: Entity): void {
  const type = shapeRep.isA().toUpperCase();
  if (!REPRESENTATION_TYPES.includes(type)) {
    throw new Error(`Expected entity type to be one of ${JSON.stringify(REPRESENTATION_TYPES)}, got '${type}`);
  }
}

/**
 * The 4x4 transform at a distance along an alignment representation curve (composite, gradient or
 * segmented reference curve), as util.evaluate_representation gives it: the transpose of the evaluator matrix.
 */
export function evaluateRepresentation(shapeRep: Entity, distAlong: number): Float64Array {
  checkRepresentationType(shapeRep);
  const settings = new Settings();
  try {
    return transposed(matrixAt(settings, shapeRep, () => distAlong));
  } finally {
    settings.destroy();
  }
}

/** The 4x4 transform at a distance along an IfcCurveSegment, as util.evaluate_segment gives it. */
export function evaluateSegment(segment: Entity, distAlong: number): Float64Array {
  const type = segment.isA().toUpperCase();
  if (type !== 'IFCCURVESEGMENT') throw new Error(`Expected entity type 'IFCCURVESEGMENT', got '${type}`);
  const length = (segment.get('SegmentLength') as Entity).wrappedValue as number;
  if (distAlong > Math.abs(length)) {
    throw new Error(`Provided value distAlong=${distAlong} is beyond the end of the segment (${length}).`);
  }
  const settings = new Settings();
  try {
    return transposed(matrixAt(settings, segment, () => distAlong));
  } finally {
    settings.destroy();
  }
}

/** Vertices along an alignment representation curve, at most `distanceInterval` apart: x, y, z for each vertex. */
export function generateVertices(repCurve: Entity | null, options: { distanceInterval?: number } = {}): Float64Array {
  const { distanceInterval = 5.0 } = options;
  if (repCurve === null) throw new Error('Alignment representation not found.');
  checkRepresentationType(repCurve);
  const settings = new Settings();
  settings.set('piecewise-step-type', 0); // The step size is the largest step.
  settings.set('piecewise-step-size', distanceInterval);
  // A curve is not a product, so createShape gives its geometry.
  const geometry = createShape(settings, repCurve) as IfcOpenshellGeomTriangulation | null;
  try {
    const vertices = geometry?.vertsBuffer() ?? new Float64Array();
    if (vertices.length === 0) throw new Error('[ERROR] No vertices generated by ifcopenshell.geom.create_shape().');
    return Float64Array.from(vertices);
  } finally {
    geometry?.destroy();
    settings.destroy();
  }
}

/**
 * The 4x4 matrix (row-major) at the end of an IfcAlignmentSegment or IfcCurveSegment. The temporary
 * entities that the calculation needs are removed again (Python discards a transaction).
 */
export function _getSegmentEndpoint(file: File, segment: Entity): Float64Array {
  const expected = ['IfcAlignmentSegment', 'IfcCurveSegment'];
  if (!expected.includes(segment.isA())) {
    throw new TypeError(`Expected entity type to be one of ${JSON.stringify(expected)}, instead received ${segment.isA()}`);
  }
  const lastId = file.maxId;
  const settings = new Settings();
  try {
    let curveSegment = segment;
    if (segment.isA('IfcAlignmentSegment')) {
      const layout = getLayout(segment);
      const mapped = _mapAlignmentSegment(file, layout, segment);
      curveSegment = mapped[1] ?? mapped[0]!;
      // The kernel finds the layout (vertical or cant) of a segment from the curve that uses it; a
      // segment without a curve is horizontal.
      if (layout.isA('IfcAlignmentVertical')) {
        file.create('IfcGradientCurve', { Segments: [curveSegment] });
      } else if (layout.isA('IfcAlignmentCant')) {
        // Without a next segment, the end of a cant segment comes from the EndPoint of its curve.
        const parameters = entity(segment, 'DesignParameters');
        const dsl = parameters.get('StartCantLeft') as number;
        const dsr = parameters.get('StartCantRight') as number;
        const del = (parameters.get('EndCantLeft') as number | null) ?? dsl;
        const der = (parameters.get('EndCantRight') as number | null) ?? dsr;
        const cant = der - del;
        const railhead = layout.get('RailHeadDistance') as number;
        file.create('IfcSegmentedReferenceCurve', {
          Segments: [curveSegment],
          EndPoint: file.create('IfcAxis2Placement3D', {
            Location: file.create('IfcCartesianPoint', { Coordinates: [parameters.get('StartDistAlong') as number, 0.5 * (del + der), 0.0] }),
            RefDirection: file.create('IfcDirection', { DirectionRatios: [1.0, 0.0, 0.0] }),
            Axis: file.create('IfcDirection', { DirectionRatios: [0.0, cant / railhead, Math.sqrt(railhead ** 2 - cant ** 2) / railhead] }),
          }),
        });
      }
    }
    return matrixAt(settings, curveSegment, ([, end]) => end);
  } finally {
    settings.destroy();
    for (let id = file.maxId; id > lastId; id--) {
      try {
        file.remove(file.byId(id));
      } catch {
        // No entity has this id.
      }
    }
  }
}

/**
 * The IfcCurveSegment.Transition of a segment: a comparison of the position, the direction and the
 * curvature at its end with those at the start of the next segment of the same curve.
 */
export function getCurveSegmentTransitionCode(segment: Entity, nextSegment: Entity, options: { positionTolerance?: number } = {}): string {
  const { positionTolerance = 0.001 } = options;
  for (const value of [segment, nextSegment]) {
    if (!value.isA('IfcCurveSegment')) throw new TypeError(`Expected to see 'IfcCurveSegment', instead received '${value.isA()}'.`);
  }
  const segmentCurves = segment.get('UsingCurves') as Entity[];
  const nextCurves = nextSegment.get('UsingCurves') as Entity[];
  if (segmentCurves.length !== 1) throw new TypeError('segment must belong to exactly one curve');
  if (nextCurves.length !== 1) throw new TypeError('next_segment must belong to exactly one curve');
  if (segmentCurves[0] !== nextCurves[0]) throw new TypeError('Both segments must belong to the same curve');

  const settings = new Settings();
  settings.set('COMPUTE_CURVATURE', true);
  try {
    const end = matrixAt(settings, segment, ([, last]) => last);
    const start = matrixAt(settings, nextSegment, ([first]) => first);
    const column = (m: Float64Array, c: number) => [m[c]!, m[4 + c]!, m[8 + c]!];
    const samePosition = allClose(column(end, 3), column(start, 3), positionTolerance);
    const sameGradient = allClose(column(end, 0), column(start, 0));
    const sameCurvature = allClose(end.subarray(12, 15), start.subarray(12, 15));
    if (!samePosition) return 'DISCONTINUOUS';
    if (!sameGradient) return 'CONTINUOUS';
    return sameCurvature ? 'CONTSAMEGRADIENTSAMECURVATURE' : 'CONTSAMEGRADIENT';
  } finally {
    settings.destroy();
  }
}

/** Sets the fallback position (IfcLinearPlacement.CartesianPosition) of a linear placement to its placement. */
export function updateFallbackPosition(file: File, lp: Entity): void {
  if (!lp.get('CartesianPosition')) {
    lp.set('CartesianPosition', file.create('IfcAxis2Placement3D', { Location: file.create('IfcCartesianPoint', { Coordinates: [0.0, 0.0, 0.0] }) }));
  }
  const p = getPlacement({ placement: lp });
  const position = entity(lp, 'CartesianPosition');
  entity(position, 'Location').set('Coordinates', [at(p, 0, 3), at(p, 1, 3), at(p, 2, 3)]);
  direction(file, position, 'RefDirection', [1.0, 0.0, 0.0]).set('DirectionRatios', [at(p, 0, 0), at(p, 1, 0), at(p, 2, 0)]);
  direction(file, position, 'Axis', [0.0, 0.0, 1.0]).set('DirectionRatios', [at(p, 0, 2), at(p, 1, 2), at(p, 2, 2)]);
}

const ZERO_LENGTH_LAYOUTS = [
  'IfcAlignmentHorizontal',
  'IfcAlignmentVertical',
  'IfcAlignmentCant',
  'IfcCompositeCurve',
  'IfcGradientCurve',
  'IfcSegmentedReferenceCurve',
];

/** The last nested segment of a layout, or null. */
function lastNestedSegment(layout: Entity): Entity | null {
  for (const rel of layout.get('IsNestedBy') as Entity[]) {
    const objects = rel.get('RelatedObjects') as Entity[];
    if (objects.length > 0) return objects[objects.length - 1]!;
  }
  return null;
}

/**
 * Adds a zero length segment to the end of a layout (an alignment layout or its curve), placed at the
 * end of the last segment. Returns false when the layout has one already, and nothing for a curve
 * type that has no zero length segment.
 */
export function addZeroLengthSegment(file: File, layout: Entity): boolean | undefined {
  if (layout.isA('IfcOffsetCurveByDistances') || layout.isA('IfcPolyline') || layout.isA('IfcIndexedPolyCurve')) return undefined;
  if (!ZERO_LENGTH_LAYOUTS.includes(layout.isA())) {
    throw new TypeError(`Expected layout type to be one of ${JSON.stringify(ZERO_LENGTH_LAYOUTS)}, instead received ${layout.isA()}`);
  }
  if (hasZeroLengthSegment(layout)) return false;

  if (layout.isA('IfcCompositeCurve') || layout.isA('IfcGradientCurve') || layout.isA('IfcSegmentedReferenceCurve')) {
    const parentCurve = file.create('IfcLine', {
      Pnt: file.create('IfcCartesianPoint', { Coordinates: [0.0, 0.0] }),
      Dir: file.create('IfcVector', { Orientation: file.create('IfcDirection', { DirectionRatios: [1.0, 0.0] }), Magnitude: 1.0 }),
    });
    const placement = layout.isA('IfcSegmentedReferenceCurve')
      ? file.create('IfcAxis2Placement3D', {
          Location: file.create('IfcCartesianPoint', { Coordinates: [0.0, 0.0, 0.0] }),
          RefDirection: file.create('IfcDirection', { DirectionRatios: [1.0, 0.0, 0.0] }),
          Axis: file.create('IfcDirection', { DirectionRatios: [0.0, 0.0, 1.0] }),
        })
      : file.create('IfcAxis2Placement2D', {
          Location: file.create('IfcCartesianPoint', { Coordinates: [0.0, 0.0] }),
          RefDirection: file.create('IfcDirection', { DirectionRatios: [1.0, 0.0] }),
        });
    const zeroLengthCurveSegment = file.create('IfcCurveSegment', {
      Transition: 'DISCONTINUOUS',
      Placement: placement,
      SegmentStart: file.create('IfcLengthMeasure', [0.0]),
      SegmentLength: file.create('IfcLengthMeasure', [0.0]),
      ParentCurve: parentCurve,
    });
    const segments = (layout.get('Segments') as Entity[] | null) ?? [];
    if (segments.length > 0) {
      // The end of the last segment is the placement of the zero length segment.
      const lastSegment = segments[segments.length - 1]!;
      _updateZeroLengthSegmentPlacement(file, zeroLengthCurveSegment, _getSegmentEndpoint(file, lastSegment));
      _updateCurveSegmentTransitionCode(lastSegment, zeroLengthCurveSegment);
    }
    layout.set('Segments', [...segments, zeroLengthCurveSegment]);
    // The base curves get a zero length segment too.
    if (layout.isA('IfcSegmentedReferenceCurve') || layout.isA('IfcGradientCurve')) addZeroLengthSegment(file, entity(layout, 'BaseCurve'));
    return true;
  }

  let designParameters: Entity;
  if (layout.isA('IfcAlignmentHorizontal')) {
    let [x, y, dx, dy] = [0.0, 0.0, 1.0, 0.0];
    const lastSegment = lastNestedSegment(layout);
    if (lastSegment) {
      const e = _getSegmentEndpoint(file, lastSegment);
      const unitScale = calculateUnitScale(file);
      [x, y, dx, dy] = [at(e, 0, 3) / unitScale, at(e, 1, 3) / unitScale, at(e, 0, 0), at(e, 1, 0)];
    }
    const angleUnitScale = calculateUnitScale(file, { unitType: 'PLANEANGLEUNIT' });
    designParameters = file.create('IfcAlignmentHorizontalSegment', {
      StartPoint: file.create('IfcCartesianPoint', { Coordinates: [x, y] }),
      StartDirection: Math.atan2(dy, dx) / angleUnitScale,
      StartRadiusOfCurvature: 0.0,
      EndRadiusOfCurvature: 0.0,
      SegmentLength: 0.0,
      PredefinedType: 'LINE',
    });
  } else if (layout.isA('IfcAlignmentVertical')) {
    let [distAlong, height, gradient] = [0.0, 0.0, 0.0];
    const lastSegment = lastNestedSegment(layout);
    if (lastSegment) {
      const parameters = entity(lastSegment, 'DesignParameters');
      distAlong = (parameters.get('StartDistAlong') as number) + (parameters.get('HorizontalLength') as number);
      gradient = parameters.get('EndGradient') as number;
      height = at(_getSegmentEndpoint(file, lastSegment), 1, 3) / calculateUnitScale(file);
    }
    designParameters = file.create('IfcAlignmentVerticalSegment', {
      StartDistAlong: distAlong,
      HorizontalLength: 0.0,
      StartHeight: height,
      StartGradient: gradient,
      EndGradient: gradient,
      PredefinedType: 'CONSTANTGRADIENT',
    });
  } else {
    let [distAlong, cantLeft, cantRight] = [0.0, 0.0, 0.0];
    const lastSegment = lastNestedSegment(layout);
    if (lastSegment) {
      const parameters = entity(lastSegment, 'DesignParameters');
      distAlong = (parameters.get('StartDistAlong') as number) + (parameters.get('HorizontalLength') as number);
      cantLeft = (parameters.get('EndCantLeft') as number | null) ?? (parameters.get('StartCantLeft') as number);
      cantRight = (parameters.get('EndCantRight') as number | null) ?? (parameters.get('StartCantRight') as number);
    }
    designParameters = file.create('IfcAlignmentCantSegment', {
      StartDistAlong: distAlong,
      HorizontalLength: 0.0,
      StartCantLeft: cantLeft,
      StartCantRight: cantRight,
      PredefinedType: 'CONSTANTCANT',
    });
  }
  const zeroLengthSegment = file.create('IfcAlignmentSegment', { GlobalId: guid.new(), DesignParameters: designParameters });
  assignObject(file, [zeroLengthSegment], layout);
  return true;
}
