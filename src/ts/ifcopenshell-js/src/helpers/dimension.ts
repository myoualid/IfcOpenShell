// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// The derived attribute Dim of IFC geometric items, as the IFC schemas define it (IfcDimensionCount).
// Python ifcopenshell computes derived attributes with its generated EXPRESS rules; generated TS code
// calls dim() for `.Dim`. Only the item types below are supported.

import type { EntityInstance } from '../entity_instance.js';

function attribute(item: EntityInstance, name: string): EntityInstance {
  return item.get(name) as EntityInstance;
}

/** The dimension count (2 or 3) of a point, direction, placement or curve. */
export function dim(item: EntityInstance): number {
  if (item.isA('IfcCartesianPoint')) return (item.get('Coordinates') as number[]).length;
  if (item.isA('IfcDirection')) return (item.get('DirectionRatios') as number[]).length;
  if (item.isA('IfcCartesianPointList2D')) return 2;
  if (item.isA('IfcCartesianPointList3D')) return 3;
  if (item.isA('IfcAxis2Placement2D')) return 2;
  if (item.isA('IfcAxis2Placement3D') || item.isA('IfcAxis1Placement')) return 3;
  if (item.isA('IfcPlacement')) return dim(attribute(item, 'Location'));
  if (item.isA('IfcPolyline')) return dim((item.get('Points') as EntityInstance[])[0]!);
  if (item.isA('IfcIndexedPolyCurve')) return dim(attribute(item, 'Points'));
  if (item.isA('IfcLine')) return dim(attribute(item, 'Pnt'));
  if (item.isA('IfcConic')) return dim(attribute(item, 'Position'));
  if (item.isA('IfcTrimmedCurve')) return dim(attribute(item, 'BasisCurve'));
  if (item.isA('IfcOffsetCurve2D')) return 2;
  if (item.isA('IfcOffsetCurve3D')) return 3;
  if (item.isA('IfcBSplineCurve')) return dim((item.get('ControlPointsList') as EntityInstance[])[0]!);
  if (item.isA('IfcCompositeCurveSegment')) return dim(attribute(item, 'ParentCurve'));
  if (item.isA('IfcCompositeCurve')) return dim((item.get('Segments') as EntityInstance[])[0]!);
  throw new Error(`Dim of ${item.isA()} is not supported`);
}
