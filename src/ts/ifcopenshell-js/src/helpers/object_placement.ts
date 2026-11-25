// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// api.geometry.edit_object_placement, which uses numpy in Python, written by hand with TypedArrays.
// Matrices are 4x4 Float64Arrays in row-major order (see helpers/placement.ts).
// The generated api/geometry/edit_object_placement re-exports it (see `hand_written` in src/transpiler/ts.yaml).

import type { EntityInstance } from '../entity_instance.js';
import type { File } from '../file.js';
import { updateOwnerHistory } from '../api/owner/update_owner_history.js';
import { removeDeep2, replaceAttribute } from '../util/element.js';
import { calculateUnitScale } from '../util/unit.js';
import { a2p, getPlacement, invert, multiply, type Matrix4 } from './placement.js';

/** A child element and its placement matrix before the parent moves. */
export type ChildPlacement = [EntityInstance, Matrix4];

/** A 4x4 matrix as a flat row-major array or as four rows. */
export type MatrixLike = ArrayLike<number> | ArrayLike<ArrayLike<number>>;

function toMatrix(matrix: MatrixLike): Matrix4 {
  const rows = matrix as ArrayLike<ArrayLike<number> | number>;
  if (rows.length === 4 && typeof rows[0] !== 'number') {
    return Float64Array.from({ length: 16 }, (_, i) => Number((rows[Math.floor(i / 4)] as ArrayLike<number>)[i % 4]));
  }
  if (rows.length !== 16) throw new Error('A placement matrix must be 4x4');
  return Float64Array.from(rows as ArrayLike<number>, Number);
}

/** The values of an inverse attribute, or none when the entity has no such attribute. */
function inverse(product: EntityInstance, name: string): EntityInstance[] {
  return product.inverseAttributes().includes(name) ? product.inverse(name) : [];
}

function column(m: Matrix4, index: number): number[] {
  return [m[index]!, m[4 + index]!, m[8 + index]!];
}

/**
 * Changes the object placement matrix of an element. Only local placements are supported.
 *
 * `matrix` is a 4x4 matrix (the identity when left out), in SI units with `isSi` (the default) or
 * in project units. With `shouldTransformChildren`, child elements (nested elements, openings,
 * fillings) move with the parent; otherwise they keep their world positions.
 * Returns the new IfcLocalPlacement.
 */
export function editObjectPlacement(
  file: File,
  product: EntityInstance,
  options: { matrix?: MatrixLike | null; isSi?: boolean; shouldTransformChildren?: boolean } = {},
): EntityInstance | null {
  const usecase = new Usecase();
  usecase.file = file;
  return usecase.execute(product, options.matrix ?? getPlacement(), options.isSi ?? true, options.shouldTransformChildren ?? false);
}

export class Usecase {
  file!: File;
  unitScale = 1;

  execute(product: EntityInstance, matrix: MatrixLike, isSi: boolean, shouldTransformChildren: boolean): EntityInstance | null {
    if (!product.attributes().includes('ObjectPlacement')) return null;
    this.unitScale = calculateUnitScale(this.file);

    const m = toMatrix(matrix);
    if (!isSi) this.convertMatrixToSi(m);

    const oldPlacement = product.get('ObjectPlacement') as EntityInstance | null;
    const children = shouldTransformChildren ? [] : this.getChildren(oldPlacement);

    const placementRelTo = this.getPlacementRelTo(product);
    const relativePlacement = this.getRelativePlacement(m, placementRelTo);
    const newPlacement = this.file.create('IfcLocalPlacement', { RelativePlacement: relativePlacement });

    if (oldPlacement) {
      for (const referencing of this.file.getInverse(oldPlacement)) {
        if (referencing.isA('IfcLocalPlacement')) replaceAttribute(referencing, oldPlacement, newPlacement);
      }
      if (this.file.getTotalInverses(oldPlacement) === 1) {
        product.set('ObjectPlacement', null);
        oldPlacement.set('PlacementRelTo', null);
        removeDeep2(this.file, oldPlacement);
      }
    }

    newPlacement.set('PlacementRelTo', placementRelTo);
    product.set('ObjectPlacement', newPlacement);

    updateOwnerHistory(this.file, product);

    for (const [child, childMatrix] of children) this.execute(child, childMatrix, false, true);

    return newPlacement;
  }

  convertMatrixToSi(matrix: Matrix4): void {
    for (let row = 0; row < 3; row++) matrix[row * 4 + 3] = matrix[row * 4 + 3]! * this.unitScale;
  }

  getPlacementRelTo(product: EntityInstance): EntityInstance | null {
    const relations: [string, string][] = [
      ['Decomposes', 'RelatingObject'],
      ['Nests', 'RelatingObject'],
      ['ContainedIn', 'RelatedElement'],
      ['VoidsElements', 'RelatingBuildingElement'],
      ['FillsVoids', 'RelatingOpeningElement'],
      ['ProjectsElements', 'RelatingElement'],
      ['AdheresToElement', 'RelatingElement'],
      ['ContainedInStructure', 'RelatingStructure'],
    ];
    for (const [name, relating] of relations) {
      const rels = inverse(product, name);
      if (!rels.length) continue;
      const relatingObject = rels[0]!.get(relating) as EntityInstance | null;
      if (!relatingObject || !relatingObject.attributes().includes('ObjectPlacement')) return null;
      return relatingObject.get('ObjectPlacement') as EntityInstance | null;
    }
    return null;
  }

  getChildren(placement: EntityInstance | null): ChildPlacement[] {
    if (!placement) return [];
    const results: ChildPlacement[] = [];
    // Subchildren are not collected: they move with their parent, whose placement is rewritten.
    for (const referencedPlacement of placement.inverse('ReferencedByPlacements')) {
      const matrix = getPlacement({ placement: referencedPlacement });
      for (const obj of referencedPlacement.inverse('PlacesObject')) {
        // Ports always move with their parent.
        if (obj.isA('IfcDistributionPort')) continue;
        if (obj.isA('IfcFeatureElement')) {
          // Features move with their parent, but their fillings keep their positions.
          for (const referencedPlacement2 of (obj.get('ObjectPlacement') as EntityInstance).inverse('ReferencedByPlacements')) {
            const matrix2 = getPlacement({ placement: referencedPlacement2 });
            for (const obj2 of referencedPlacement2.inverse('PlacesObject')) results.push([obj2, matrix2]);
          }
          continue;
        }
        results.push([obj, matrix]);
      }
    }
    return results;
  }

  getRelativePlacement(matrix: Matrix4, placementRelTo: EntityInstance | null): EntityInstance {
    const relatingObjectMatrix = getPlacement({ placement: placementRelTo, shouldReturnSi: true });
    const objectMatrix = a2p(column(matrix, 3), column(matrix, 2), column(matrix, 0));
    const relative = multiply(invert(relatingObjectMatrix), objectMatrix);
    return this.file.create('IfcAxis2Placement3D', {
      Location: this.file.create('IfcCartesianPoint', { Coordinates: this.convertSiToUnit(column(relative, 3)) }),
      Axis: this.file.create('IfcDirection', { DirectionRatios: column(relative, 2) }),
      RefDirection: this.file.create('IfcDirection', { DirectionRatios: column(relative, 0) }),
    });
  }

  convertSiToUnit(co: number[]): number[] {
    return co.map(value => value / this.unitScale);
  }

  convertUnitToSi(co: number[]): number[] {
    return co.map(value => value * this.unitScale);
  }
}
