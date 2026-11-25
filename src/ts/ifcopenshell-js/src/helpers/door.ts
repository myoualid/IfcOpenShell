// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.geometry.add_door_representation functions that use numpy vectors in Python, written by hand
// with arrays of numbers (x, y, z). The generated module re-exports them and assigns the Usecase method
// (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import { addShapeAspect } from '../api/geometry/add_shape_aspect.js';
import type { Usecase } from '../api/geometry/add_door_representation.js';
import { ShapeBuilder } from '../util/shape_builder.js';
import { createIfcWindow, extrudeAlongY } from './window.js';

type Entity = EntityInstance;
type Vector3 = [number, number, number];

const plus = (a: ArrayLike<number>, b: ArrayLike<number>): number[] => Array.from(a, (value, i) => value + b[i]!);

/**
 * A door lining (or casing): a U shaped profile of the size x, y (depth), z, open at the bottom,
 * extruded along Y and moved to `position`. `thickness` is SIDE, TOP, or one value for both.
 */
export function createIfcDoorLining(
  builder: ShapeBuilder,
  size: ArrayLike<number>,
  thickness: number[] | number,
  position: ArrayLike<number> | null = null,
): Entity {
  const [thSide, thUp] = Array.isArray(thickness) ? (thickness as [number, number]) : [thickness, thickness];
  const [x, y, z] = [size[0]!, size[1]!, size[2]!];
  // The points of the profile in the XZ plane.
  const points: [number, number][] = [
    [0.0, 0.0],
    [0.0, z],
    [x, z],
    [x, 0.0],
    [x - thSide, 0.0],
    [x - thSide, z - thUp],
    [thSide, z - thUp],
    [thSide, 0.0],
  ];
  const lining = extrudeAlongY(builder, builder.polyline(points, { closed: true }), y);
  builder.translate(lining, position ?? [0, 0, 0]);
  return lining;
}

/** A box of the size x, y, z at `position`: a rectangle extruded along Z. */
export function createIfcBox(builder: ShapeBuilder, size: ArrayLike<number>, position: ArrayLike<number> | null = null): Entity {
  const rect = builder.rectangle({ size: [size[0]!, size[1]!] });
  return builder.extrude(rect, { magnitude: size[2]!, position: position ?? [0, 0, 0], extrusionVector: [0, 0, 1] });
}

/**
 * The representation of a door of the type `operationType` (single or double, swing or sliding,
 * left or right): ELEVATION_VIEW, PLAN_VIEW (with an Annotation of the slide direction for sliding
 * doors) or the 3D body (lining, threshold, casings, panels with handles and a window above the
 * transom) with its shape aspects.
 */
export function UsecaseExecute(
  this: Usecase,
  context: Entity,
  unitScale: number,
  overallHeight: number | null,
  overallWidth: number | null,
  operationType: string,
  liningProperties: Record<string, unknown>,
  panelProperties: Record<string, unknown>,
  partOfProduct: Entity | null,
): Entity | null {
  this.unit_scale = unitScale;
  const siConversion = 1 / unitScale;
  const unit = (value: number) => value * siConversion;
  const height = overallHeight ?? unit(2.0);
  const width = overallWidth ?? unit(0.9);
  const builder = new ShapeBuilder(this.file);
  const doubleSwingDoor = operationType.includes('DOUBLE_SWING');
  const doubleDoor = operationType.includes('DOUBLE_DOOR');
  const slidingDoor = operationType.includes('SLIDING');

  if (context.get('TargetView') === 'ELEVATION_VIEW') {
    return builder.getRepresentation(context, builder.rectangle({ size: [width, 0, height] }));
  }

  // Lining.
  const liningDepth = liningProperties['LiningDepth'] as number;
  const liningThicknessDefault = liningProperties['LiningThickness'] as number;
  const liningOffset = liningProperties['LiningOffset'] as number;
  const liningToPanelOffsetX = !slidingDoor ? (liningProperties['LiningToPanelOffsetX'] as number) : liningThicknessDefault;
  const panelDepth = panelProperties['PanelDepth'] as number;
  const liningToPanelOffsetYFull = !slidingDoor ? (liningProperties['LiningToPanelOffsetY'] as number) : -panelDepth;

  const transomThickness = (liningProperties['TransomThickness'] as number) / 2;
  let transomOffset = liningProperties['TransomOffset'] as number;
  if (transomThickness === 0) transomOffset = 0;
  const windowLiningHeight = height - transomOffset - transomThickness;

  let sideLiningThickness = liningThicknessDefault;
  const panelLiningOverlapX = !slidingDoor ? Math.max(liningThicknessDefault - liningToPanelOffsetX, 0) : 0;
  let topLiningThickness = transomThickness || liningThicknessDefault;
  const panelTopLiningOverlapX = !slidingDoor ? Math.max(topLiningThickness - liningToPanelOffsetX, 0) : 0;
  const doorOpeningWidth = width - liningToPanelOffsetX * 2;
  if (doubleSwingDoor) {
    sideLiningThickness = sideLiningThickness - panelLiningOverlapX;
    topLiningThickness = topLiningThickness - panelTopLiningOverlapX;
  }

  const thresholdThickness = liningProperties['ThresholdThickness'] as number;
  const thresholdDepth = liningProperties['ThresholdDepth'] as number;
  const thresholdOffset = liningProperties['ThresholdOffset'] as number;
  const thresholdWidth = width - sideLiningThickness * 2;

  const casingThickness = liningProperties['CasingThickness'] as number;
  const casingDepth = liningProperties['CasingDepth'] as number;

  // Panel.
  const panelWidth = doorOpeningWidth * (panelProperties['PanelWidth'] as number);
  const frameDepth = panelProperties['FrameDepth'] as number;
  const frameThickness = panelProperties['FrameThickness'] as number;
  const frameHeight = windowLiningHeight - liningToPanelOffsetX * 2;
  const glassThickness = unit(0.01);

  // The handle (fixed sizes).
  const handleSize: Vector3 = [unit(120 * 0.001), unit(40 * 0.001), unit(20 * 0.001)];
  // To the centre of the handle.
  const handleOffset: Vector3 = [unit(60 * 0.001), unit(0 * 0.001), unit(1000 * 0.001)];
  const handleCenterOffset: Vector3 = [handleSize[1] / 2 / 2, 0 / 2, handleSize[2] / 2];
  const sliderArrowSymbolSize = unit(30 * 0.001);

  let panelHeight: number;
  let liningHeight: number;
  if (transomOffset) {
    panelHeight = transomOffset + transomThickness - liningToPanelOffsetX - thresholdThickness;
    liningHeight = transomOffset + transomThickness;
  } else {
    panelHeight = height - liningToPanelOffsetX - thresholdThickness;
    liningHeight = height;
  }

  const liningSize: Vector3 = [width, liningDepth, liningHeight];
  const liningThickness = [sideLiningThickness, topLiningThickness];
  const lShapeCheck = (thicknesses: number[]) =>
    liningToPanelOffsetYFull < liningDepth && thicknesses.some(th => liningToPanelOffsetX < th);

  if (context.get('TargetView') === 'PLAN_VIEW') {
    const items2d: Entity[] = [];
    const panelSize = [panelWidth, panelDepth];
    const panelPosition = !slidingDoor ? [liningToPanelOffsetX, liningDepth] : [liningToPanelOffsetX, -panelSize[1]!];

    if (context.get('ContextIdentifier') === 'Annotation') {
      // Only a sliding door has an annotation: an arrow of its slide direction.
      if (!slidingDoor) return null;
      const arrowOffset = sliderArrowSymbolSize / Math.cos((15 * Math.PI) / 180);
      const arrowSymbol = [
        builder.polyline([[0.35 * panelSize[0]!, 0], [0.65 * panelSize[0]!, 0]]),
        builder.polyline([[sliderArrowSymbolSize, arrowOffset], [0, 0], [sliderArrowSymbolSize, -arrowOffset]], {
          positionOffset: [0.35 * panelSize[0]!, 0],
        }),
      ];
      builder.translate(arrowSymbol, plus(panelPosition, [0, -arrowOffset * 1.5]));
      items2d.push(...arrowSymbol);
      return builder.getRepresentation(context, items2d, { representationType: 'Curve2D' });
    }

    const lining = lShapeCheck([sideLiningThickness])
      ? builder.polyline(
          [
            [0, 0],
            [0, liningDepth],
            [liningToPanelOffsetX, liningDepth],
            [liningToPanelOffsetX, liningToPanelOffsetYFull],
            [liningThicknessDefault, liningToPanelOffsetYFull],
            [liningThicknessDefault, 0],
          ],
          { closed: true },
        )
      : builder.rectangle({ size: [sideLiningThickness, liningDepth] });
    items2d.push(lining);
    items2d.push(builder.mirror(lining, { mirrorAxes: [1, 0], mirrorPoint: [width / 2, 0], createCopy: true }) as Entity);

    const slidingPanel2d = (size: number[], position: number[], swing: 'LEFT' | 'RIGHT'): Entity[] => {
      const door = builder.rectangle({ size, position: [position[0]! - size[0]! * 0.5, position[1]! - 0] });
      if (swing === 'RIGHT') builder.mirror(door, { mirrorAxes: [1, 0], mirrorPoint: plus(position, [size[0]! / 2, 0]) });
      return [door];
    };
    // TODO in Python: make the second swing lines dashed.
    const panel2d = (size: number[], position: number[], swing: 'LEFT' | 'RIGHT', sliding = false): Entity[] => {
      if (sliding) return slidingPanel2d(size, position, swing);
      const doorItems: Entity[] = [];
      const yx = [size[1]!, size[0]!];
      // The swing: a quarter (or a half, for a double swing) of an ellipse.
      let trimPointsMask: number[];
      if (doubleSwingDoor) {
        trimPointsMask = [3, 1];
        doorItems.push(builder.polyline([[0, 0], [0, -yx[1]!], [yx[0]!, -yx[1]!]]));
      } else {
        trimPointsMask = [0, 1];
      }
      doorItems.push(builder.createEllipseCurve(yx[1]! - yx[0]!, yx[1]!, { trimPointsMask, position: [yx[0]!, 0] }));
      doorItems.push(builder.rectangle({ size: yx }));
      builder.translate(doorItems, position);
      if (swing === 'RIGHT') builder.mirror(doorItems, { mirrorAxes: [1, 0], mirrorPoint: plus(position, [yx[1]! / 2, 0]) });
      return doorItems;
    };

    const doorItems: Entity[] = [];
    if (doubleDoor) {
      panelSize[0] = panelSize[0]! / 2;
      doorItems.push(...panel2d(panelSize, panelPosition, 'LEFT', slidingDoor));
      const mirrorPoint = plus(panelPosition, [doorOpeningWidth / 2, 0]);
      doorItems.push(...(builder.mirror(doorItems, { mirrorAxes: [1, 0], mirrorPoint, createCopy: true }) as Entity[]));
    } else {
      const swing = operationType.endsWith('LEFT') ? 'LEFT' : 'RIGHT';
      doorItems.push(...panel2d(panelSize, panelPosition, swing, slidingDoor));
    }
    items2d.push(...doorItems);
    builder.translate(items2d, [0, liningOffset]);
    return builder.getRepresentation(context, items2d);
  }

  // The lining: rectangular, or L shaped with a second lining when the panel is inside it.
  const liningItems: Entity[] = [];
  let mainLiningSize: Vector3 = liningSize;
  if (lShapeCheck(liningThickness)) {
    mainLiningSize = [liningSize[0], liningToPanelOffsetYFull, liningSize[2]];
    const secondLiningSize: Vector3 = [liningSize[0], liningSize[1] - liningToPanelOffsetYFull, liningSize[2]];
    const secondLiningThickness = liningThickness.map(th => Math.min(th, liningToPanelOffsetX));
    liningItems.push(createIfcDoorLining(builder, secondLiningSize, secondLiningThickness, [0, liningToPanelOffsetYFull, 0]));
  }
  liningItems.push(createIfcDoorLining(builder, mainLiningSize, liningThickness));

  const thresholdItems: Entity[] = thresholdThickness
    ? [createIfcBox(builder, [thresholdWidth, thresholdDepth, thresholdThickness], [sideLiningThickness, thresholdOffset, 0])]
    : [];

  const casingItems: Entity[] = [];
  if (!liningOffset && casingThickness) {
    const casingWallOverlap = Math.max(casingThickness - liningThicknessDefault, 0);
    const innerCasingThickness = [casingThickness - panelLiningOverlapX, casingThickness - panelTopLiningOverlapX];
    const outerCasingThickness = doubleSwingDoor ? [...innerCasingThickness] : casingThickness;
    const casingSize: Vector3 = [width + casingWallOverlap * 2, casingDepth, height + casingWallOverlap];
    casingItems.push(createIfcDoorLining(builder, casingSize, outerCasingThickness, [-casingWallOverlap, -casingDepth, 0]));
    casingItems.push(createIfcDoorLining(builder, casingSize, innerCasingThickness, [-casingWallOverlap, liningDepth, 0]));
  }

  const doorPanel = (size: Vector3, position: Vector3, swing: 'LEFT' | 'RIGHT'): Entity[] => {
    const doorItems: Entity[] = [createIfcBox(builder, size, position)];
    const handlePoints: [number, number][] = [
      [0, 0],
      [0, -handleSize[1]],
      [handleSize[0], -handleSize[1]],
      [handleSize[0], -handleSize[1] / 2],
      [handleSize[1] / 2, -handleSize[1] / 2],
      [handleSize[1] / 2, 0],
    ];
    const handlePolyline = builder.polyline(handlePoints, { closed: true });
    const handlePosition = position.map((value, i) => value + handleOffset[i]! - handleCenterOffset[i]!);
    const doorHandle = builder.extrude(handlePolyline, { magnitude: handleSize[2], position: handlePosition });
    doorItems.push(doorHandle);
    if (swing === 'LEFT') {
      builder.mirror(doorHandle, { mirrorAxes: [1, 0], mirrorPoint: [position[0] + size[0] / 2, position[1] + 0] });
    }
    const mirrored = builder.mirror(doorHandle, {
      mirrorAxes: [0, 1],
      mirrorPoint: [handlePosition[0]! + 0, handlePosition[1]! + size[1] / 2],
      createCopy: true,
    }) as Entity;
    doorItems.push(mirrored);
    return doorItems;
  };

  const doorItems: Entity[] = [];
  const panelSize: Vector3 = [panelWidth, panelDepth, panelHeight];
  const panelPosition: Vector3 = [liningToPanelOffsetX, liningToPanelOffsetYFull, thresholdThickness];
  if (doubleDoor) {
    // A little space between the doors, for readability.
    const doubleDoorOffset = unit(0.001);
    panelSize[0] = panelSize[0] / 2 - doubleDoorOffset;
    doorItems.push(...doorPanel(panelSize, panelPosition, 'LEFT'));
    const mirrorPoint = [panelPosition[0] + doorOpeningWidth / 2, panelPosition[1] + 0];
    doorItems.push(...(builder.mirror(doorItems, { mirrorAxes: [1, 0], mirrorPoint, createCopy: true }) as Entity[]));
  } else {
    doorItems.push(...doorPanel(panelSize, panelPosition, operationType.endsWith('LEFT') ? 'LEFT' : 'RIGHT'));
  }

  // The window above the transom.
  let windowLiningItems: Entity[] = [];
  let frameItems: Entity[] = [];
  let glassItems: Entity[] = [];
  if (transomThickness) {
    const windowLiningThickness = [sideLiningThickness, liningThicknessDefault, sideLiningThickness, transomThickness];
    const items = createIfcWindow(
      builder,
      [width, liningDepth, windowLiningHeight],
      windowLiningThickness,
      liningToPanelOffsetX,
      liningToPanelOffsetYFull,
      [doorOpeningWidth, frameDepth, frameHeight],
      frameThickness,
      glassThickness,
      [0, 0, height - windowLiningHeight],
    );
    windowLiningItems = items.Lining;
    frameItems = items.Framing;
    glassItems = items.Glazing;
  }

  const liningOffsetItems = [...liningItems, ...doorItems, ...windowLiningItems, ...frameItems, ...glassItems];
  builder.translate(liningOffsetItems, [0, liningOffset, 0]);
  const representation = builder.getRepresentation(context, [...liningOffsetItems, ...thresholdItems, ...casingItems]);
  if (partOfProduct) {
    addShapeAspect(this.file, 'Lining', [...liningItems, ...windowLiningItems, ...thresholdItems, ...casingItems], representation, partOfProduct);
    addShapeAspect(this.file, 'Framing', [...doorItems, ...frameItems], representation, partOfProduct);
    if (glassItems.length) addShapeAspect(this.file, 'Glazing', glassItems, representation, partOfProduct);
  }
  return representation;
}
