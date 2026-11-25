// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.alignment functions that read 4x4 numpy matrices in Python, written by hand with the
// row-major Float64Array matrices of helpers/placement.ts (m[row * 4 + column] is numpy m[row, column]).
// The generated api/alignment modules re-export them (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import type { File } from '../file.js';
import { addZeroLengthSegment } from '../api/alignment/add_zero_length_segment.js';
import { getLayout } from '../api/alignment/get_layout.js';
import { hasZeroLengthSegment } from '../api/alignment/has_zero_length_segment.js';
import { calculateUnitScale } from '../util/unit.js';
import { getPlacement } from './placement.js';

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
