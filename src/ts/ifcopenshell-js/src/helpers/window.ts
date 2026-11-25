// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.geometry.add_window_representation functions that use numpy vectors in Python, written by hand
// with arrays of numbers (x, y, z). The generated module re-exports them and assigns the Usecase method
// (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import { addShapeAspect } from '../api/geometry/add_shape_aspect.js';
import type { Usecase } from '../api/geometry/add_window_representation.js';
import { ShapeBuilder } from '../util/shape_builder.js';

type Entity = EntityInstance;
type Vector3 = [number, number, number];

/** builder.extrude(..., **builder.extrude_kwargs("Y")): an extrusion along +Y of a curve in the XZ plane. */
export function extrudeAlongY(builder: ShapeBuilder, profileOrCurve: Entity, magnitude: number, position: ArrayLike<number> = [0, 0, 0]): Entity {
  const kwargs = builder.extrudeKwargs('Y');
  return builder.extrude(profileOrCurve, {
    magnitude,
    position,
    positionXAxis: kwargs.position_x_axis,
    positionZAxis: kwargs.position_z_axis,
    extrusionVector: kwargs.extrusion_vector,
  });
}

/**
 * A frame (lining or panel frame) of the size x, y (depth), z: one extrusion with the opening as an
 * inner curve, or one extrusion for each run of sides that have a thickness. `thickness` is LEFT, TOP,
 * RIGHT, BOTTOM, or one value for all sides.
 */
export function createIfcWindowFrameSimple(
  builder: ShapeBuilder,
  size: ArrayLike<number>,
  thickness: number[] | number,
  position: ArrayLike<number> | null = null,
): Entity[] {
  const sides = Array.isArray(thickness) ? thickness : [thickness, thickness, thickness, thickness];
  const at = position ?? [0, 0, 0];
  const [thLeft, thUp, thRight, thBottom] = sides as [number, number, number, number];
  const [x, y, z] = [size[0]!, size[1]!, size[2]!];
  const extruded = (profile: Entity) => extrudeAlongY(builder, profile, y, at);

  // With all sides, the profile is a rectangle with a rectangular opening.
  if (!sides.includes(0)) {
    const panelRect = builder.rectangle({ size: [x, z] });
    const innerRect = builder.rectangle({ size: [x - (thLeft + thRight), z - (thBottom + thUp)], position: [thLeft, thBottom] });
    return [extruded(builder.profile(panelRect, { innerCurves: [innerRect] }))];
  }

  // A side without thickness splits the frame into L, U or single shapes: runs of sides, with the
  // run that ends at the last side joined to the run that starts at the first side.
  const segments: number[][] = [];
  let current: number[] = [];
  sides.forEach((value, i) => {
    if (value === 0) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(i);
    }
  });
  if (current.length) {
    if (segments.length > 0 && segments[0]![0] === 0) segments[0] = [...current, ...segments[0]!];
    else segments.push(current);
  }

  const outer: [number, number][][] = [
    [[0, 0], [0, z]],
    [[0, z], [x, z]],
    [[x, z], [x, 0]],
    [[x, 0], [0, 0]],
  ];
  const inner: [number, number][][] = [
    [[thLeft, thBottom], [thLeft, z - thUp]],
    [[thLeft, z - thUp], [x - thRight, z - thUp]],
    [[x - thRight, z - thUp], [x - thRight, thBottom]],
    [[x - thRight, thBottom], [thLeft, thBottom]],
  ];
  const points = (segment: number[]): [number, number][] => {
    const result: [number, number][] = [];
    for (const side of segment) {
      if (side === segment[0]) result.push(outer[side]![0]!);
      result.push(outer[side]![1]!);
    }
    for (const side of [...segment].reverse()) {
      if (side === segment[segment.length - 1]) result.push(inner[side]![1]!);
      result.push(inner[side]![0]!);
    }
    return result;
  };
  return segments.map(segment => extruded(builder.profile(builder.polyline(points(segment), { closed: true }))));
}

/** Whether a lining is L shaped: the panel is set back from its face and inside its thickness on a side. */
function lShapeCheck(liningToPanelOffsetYFull: number, liningDepth: number, xOffsets: number[], liningThickness: number[]): boolean {
  if (xOffsets.length !== liningThickness.length) throw new Error('zip() arguments have different lengths');
  return liningToPanelOffsetYFull < liningDepth && liningThickness.some((th, i) => xOffsets[i]! < th);
}

/**
 * A window: its lining (L shaped when the panel is inside it), its frame and its glass, moved to
 * `position`. `liningThickness` and `xOffsets` are LEFT, TOP, RIGHT, BOTTOM.
 */
export function createIfcWindow(
  builder: ShapeBuilder,
  liningSize: ArrayLike<number>,
  liningThickness: number[],
  liningToPanelOffsetX: number,
  liningToPanelOffsetYFull: number,
  frameSize: ArrayLike<number>,
  frameThickness: number,
  glassThickness: number,
  position: ArrayLike<number>,
  options: { xOffsets?: number[] | null } = {},
): { Lining: Entity[]; Framing: Entity[]; Glazing: Entity[] } {
  const xOffsets = options.xOffsets ?? [liningToPanelOffsetX, liningToPanelOffsetX, liningToPanelOffsetX, liningToPanelOffsetX];
  const liningItems: Entity[] = [];
  let mainLiningSize: ArrayLike<number> = liningSize;
  if (lShapeCheck(liningToPanelOffsetYFull, liningSize[1]!, xOffsets, liningThickness)) {
    mainLiningSize = [liningSize[0]!, liningToPanelOffsetYFull, liningSize[2]!];
    const secondLiningSize = [liningSize[0]!, liningSize[1]! - liningToPanelOffsetYFull, liningSize[2]!];
    const secondThickness = liningThickness.map((th, i) => Math.min(th, xOffsets[i]!));
    liningItems.push(...createIfcWindowFrameSimple(builder, secondLiningSize, secondThickness, [0, liningToPanelOffsetYFull, 0]));
  }
  liningItems.push(...createIfcWindowFrameSimple(builder, mainLiningSize, liningThickness));

  const framePosition: Vector3 = [xOffsets[0]!, liningToPanelOffsetYFull, xOffsets[3]!];
  const frameItems = createIfcWindowFrameSimple(builder, frameSize, frameThickness, framePosition);

  const glassPosition: Vector3 = [framePosition[0], framePosition[1] + (frameSize[1]! / 2 - glassThickness / 2), framePosition[2]];
  const glassRect = builder.deepCopy(((frameItems[0]!.get('SweptArea') as Entity).get('InnerCurves') as Entity[])[0]!);
  const glass = extrudeAlongY(builder, glassRect, glassThickness, glassPosition);

  builder.translate([...liningItems, ...frameItems, glass], position);
  return { Lining: liningItems, Framing: frameItems, Glazing: [glass] };
}

/** The 2D (PLAN_VIEW) representation of the top row of panels: linings, mullions and frames as curves. */
function window2dRepresentation(
  builder: ShapeBuilder,
  context: Entity,
  panelSchema: number[][],
  overallWidth: number,
  liningProperties: Record<string, unknown>,
  panelProperties: Record<string, unknown>[],
): Entity {
  const liningThickness = liningProperties['LiningThickness'] as number;
  const liningDepth = liningProperties['LiningDepth'] as number;
  const liningOffset = liningProperties['LiningOffset'] as number;
  const liningToPanelOffsetX = liningProperties['LiningToPanelOffsetX'] as number;
  const liningToPanelOffsetY = liningProperties['LiningToPanelOffsetY'] as number;
  const mullionThickness = (liningProperties['MullionThickness'] as number) / 2;
  const firstMullionOffset = liningProperties['FirstMullionOffset'] as number;
  const secondMullionOffset = liningProperties['SecondMullionOffset'] as number;

  const items2d: Entity[] = [];
  const topRow = panelSchema[panelSchema.length - 1]!;
  const uniqueCols = new Set(topRow).size;
  const builtPanels: number[] = [];
  let accumulatedWidth = 0;

  topRow.forEach((panelI, columnI) => {
    const curPanelItems: Entity[] = [];
    // Left and right linings.
    const windowLiningThickness = [liningThickness, liningThickness];
    const closedLining = [true, true];
    if (builtPanels.includes(panelI)) return;

    const hasMullion = uniqueCols > 1;
    const firstColumn = columnI === 0;
    const lastColumn = columnI === uniqueCols - 1;
    const leftToMullion = hasMullion && !lastColumn;
    const rightToMullion = hasMullion && !firstColumn;

    let panelWidth: number;
    if (hasMullion) {
      if (firstColumn) panelWidth = firstMullionOffset;
      else if (lastColumn) panelWidth = overallWidth - accumulatedWidth;
      else panelWidth = secondMullionOffset - accumulatedWidth;
      if (!firstColumn) {
        windowLiningThickness[0] = mullionThickness;
        closedLining[0] = false;
      }
      if (!lastColumn) {
        windowLiningThickness[1] = mullionThickness;
        closedLining[1] = false;
      }
    } else {
      panelWidth = overallWidth;
    }

    const frameDepth = panelProperties[panelI]!['FrameDepth'] as number;
    const frameThickness = panelProperties[panelI]!['FrameThickness'] as number;
    const liningToPanelOffsetYFull = liningDepth - frameDepth + liningToPanelOffsetY;
    const baseFrameClear = liningToPanelOffsetX + frameThickness - liningThickness;
    const currentOffsetX = baseFrameClear - frameThickness + mullionThickness;

    curPanelItems.push(builder.polyline([[windowLiningThickness[0]!, 0], [panelWidth - windowLiningThickness[1]!, 0]]));

    const liningShape = (thickness: number, closed: boolean, mirror: boolean, xOffset: number | null): Entity => {
      const offset = xOffset ?? liningToPanelOffsetX;
      const shape = lShapeCheck(liningToPanelOffsetYFull, liningDepth, [offset], [thickness])
        ? builder.polyline(
            [[0, liningDepth], [offset, liningDepth], [offset, liningToPanelOffsetYFull], [thickness, liningToPanelOffsetYFull], [thickness, 0], [0, 0]],
            { closed },
          )
        : builder.polyline([[0, liningDepth], [thickness, liningDepth], [thickness, 0], [0, 0]], { closed });
      if (mirror) builder.mirror(shape, { mirrorAxes: [1, 0], mirrorPoint: [panelWidth / 2, 0] });
      return shape;
    };
    curPanelItems.push(
      liningShape(windowLiningThickness[0]!, closedLining[0]!, false, rightToMullion ? currentOffsetX : null),
      liningShape(windowLiningThickness[1]!, closedLining[1]!, true, leftToMullion ? currentOffsetX : null),
    );

    const frameItems: Entity[] = [];
    const framePosition = [rightToMullion ? currentOffsetX : liningToPanelOffsetX, liningToPanelOffsetYFull];
    let frameWidth = panelWidth;
    frameWidth -= leftToMullion ? currentOffsetX : liningToPanelOffsetX;
    frameWidth -= rightToMullion ? currentOffsetX : liningToPanelOffsetX;

    const frameVertical = builder.rectangle({ size: [frameThickness, frameDepth] });
    frameItems.push(frameVertical, builder.mirror(frameVertical, { mirrorAxes: [1, 0], mirrorPoint: [frameWidth / 2, 0], createCopy: true }) as Entity);
    const frameHorizontal = builder.polyline([[frameThickness, 0], [frameWidth - frameThickness, 0]]);
    frameItems.push(frameHorizontal, builder.translate(frameHorizontal, [0, frameDepth], { createCopy: true }) as Entity);
    // The glass.
    frameItems.push(builder.translate(frameHorizontal, [0, frameDepth / 2], { createCopy: true }) as Entity);

    builder.translate(frameItems, framePosition);
    curPanelItems.push(...frameItems);
    builder.translate(curPanelItems, [accumulatedWidth, 0]);
    accumulatedWidth += panelWidth;
    builtPanels.push(panelI);
    items2d.push(...curPanelItems);
  });

  builder.translate(items2d, [0, liningOffset]);
  return builder.getRepresentation(context, items2d);
}

/**
 * The representation of a window of the panels in `panelSchema` (rows from the top, columns from the
 * left; equal numbers are one panel): ELEVATION_VIEW, PLAN_VIEW or the 3D body with its shape aspects.
 */
export function UsecaseExecute(
  this: Usecase,
  context: Entity,
  unitScale: number,
  overallHeight: number | null,
  overallWidth: number | null,
  panelSchema: number[][],
  liningProperties: Record<string, unknown>,
  panelProperties: Record<string, unknown>[],
  partOfProduct: Entity | null,
): Entity {
  this.unit_scale = unitScale;
  const siConversion = 1 / unitScale;
  const height = overallHeight ?? 0.9 * siConversion;
  const width = overallWidth ?? 0.6 * siConversion;
  const builder = new ShapeBuilder(this.file);

  if (context.get('TargetView') === 'ELEVATION_VIEW') {
    return builder.getRepresentation(context, builder.rectangle({ size: [width, 0, height] }));
  }

  const schema = [...panelSchema].reverse();
  if (context.get('TargetView') === 'PLAN_VIEW') {
    return window2dRepresentation(builder, context, schema, width, liningProperties, panelProperties);
  }

  const accumulatedHeight: number[] = schema[0]!.map(() => 0);
  const builtPanels: number[] = [];
  const windowItems: Entity[] = [];
  const liningItems: Entity[] = [];
  const framingItems: Entity[] = [];
  const glazingItems: Entity[] = [];

  const liningThickness = liningProperties['LiningThickness'] as number;
  const liningDepth = liningProperties['LiningDepth'] as number;
  const liningOffset = liningProperties['LiningOffset'] as number;
  const liningToPanelOffsetX = liningProperties['LiningToPanelOffsetX'] as number;
  const liningToPanelOffsetY = liningProperties['LiningToPanelOffsetY'] as number;
  const mullionThickness = (liningProperties['MullionThickness'] as number) / 2;
  const firstMullionOffset = liningProperties['FirstMullionOffset'] as number;
  const secondMullionOffset = liningProperties['SecondMullionOffset'] as number;
  const transomThickness = (liningProperties['TransomThickness'] as number) / 2;
  const firstTransomOffset = liningProperties['FirstTransomOffset'] as number;
  const secondTransomOffset = liningProperties['SecondTransomOffset'] as number;
  const glassThickness = 0.01 * siConversion;

  const uniqueRowsInCol = schema[0]!.map((_, columnI) => new Set(schema.map(row => row[columnI])).size);

  schema.forEach((panelRow, rowI) => {
    let accumulatedWidth = 0;
    const uniqueCols = new Set(panelRow).size;
    panelRow.forEach((panelI, columnI) => {
      const hasMullion = uniqueCols > 1;
      const firstColumn = columnI === 0;
      const lastColumn = columnI === uniqueCols - 1;
      const leftToMullion = hasMullion && !lastColumn;
      const rightToMullion = hasMullion && !firstColumn;

      const hasTransom = uniqueRowsInCol[columnI]! > 1;
      const firstRow = rowI === 0;
      const lastRow = rowI === uniqueRowsInCol[columnI]! - 1;
      const topToTransom = hasTransom && !firstRow;
      const bottomToTransom = hasTransom && !lastRow;

      let panelWidth: number;
      if (!hasMullion) panelWidth = width;
      else if (firstColumn) panelWidth = firstMullionOffset;
      else if (lastColumn) panelWidth = width - accumulatedWidth;
      else panelWidth = secondMullionOffset - accumulatedWidth;

      let panelHeight: number;
      if (!hasTransom) panelHeight = height;
      else if (firstRow) panelHeight = firstTransomOffset;
      else if (lastRow) panelHeight = height - accumulatedHeight[columnI]!;
      else panelHeight = secondTransomOffset - accumulatedHeight[columnI]!;

      if (builtPanels.includes(panelI)) {
        accumulatedHeight[columnI]! += panelHeight;
        accumulatedWidth += panelWidth;
        return;
      }

      const frameDepth = panelProperties[panelI]!['FrameDepth'] as number;
      const frameThickness = panelProperties[panelI]!['FrameThickness'] as number;
      const liningToPanelOffsetYFull = liningDepth - frameDepth + liningToPanelOffsetY;

      // The lining thickness and the frame offsets, with mullions and transoms (LEFT, TOP, RIGHT, BOTTOM).
      const windowLiningThickness = [
        rightToMullion ? mullionThickness : liningThickness,
        bottomToTransom ? transomThickness : liningThickness,
        leftToMullion ? mullionThickness : liningThickness,
        topToTransom ? transomThickness : liningThickness,
      ];
      const baseFrameClear = liningToPanelOffsetX + frameThickness - liningThickness;
      const currentOffsetX = baseFrameClear - frameThickness + mullionThickness;
      const currentOffsetZ = baseFrameClear - frameThickness + transomThickness;
      const xOffsets = [
        rightToMullion ? currentOffsetX : liningToPanelOffsetX,
        bottomToTransom ? currentOffsetZ : liningToPanelOffsetX,
        leftToMullion ? currentOffsetX : liningToPanelOffsetX,
        topToTransom ? currentOffsetZ : liningToPanelOffsetX,
      ];

      const windowLiningSize: Vector3 = [panelWidth, liningDepth, panelHeight];
      const frameSize: Vector3 = [panelWidth - (xOffsets[0]! + xOffsets[2]!), frameDepth, panelHeight - (xOffsets[1]! + xOffsets[3]!)];
      const panelPosition: Vector3 = [accumulatedWidth, 0, accumulatedHeight[columnI]!];
      const items = createIfcWindow(
        builder,
        windowLiningSize,
        windowLiningThickness,
        liningToPanelOffsetX,
        liningToPanelOffsetYFull,
        frameSize,
        frameThickness,
        glassThickness,
        panelPosition,
        { xOffsets },
      );
      builtPanels.push(panelI);
      windowItems.push(...items.Lining, ...items.Framing, ...items.Glazing);
      liningItems.push(...items.Lining);
      framingItems.push(...items.Framing);
      glazingItems.push(...items.Glazing);
      accumulatedHeight[columnI]! += panelHeight;
      accumulatedWidth += panelWidth;
    });
  });

  // The offset from the wall.
  builder.translate(windowItems, [0, liningOffset, 0]);
  const representation = builder.getRepresentation(context, windowItems);
  if (partOfProduct) {
    addShapeAspect(this.file, 'Lining', liningItems, representation, partOfProduct);
    addShapeAspect(this.file, 'Framing', framingItems, representation, partOfProduct);
    addShapeAspect(this.file, 'Glazing', glazingItems, representation, partOfProduct);
  }
  return representation;
}
