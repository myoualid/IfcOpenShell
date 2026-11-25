
import { IfcOpenshellGeomSettings } from '@ifcopenshell/wasm/api';
import { nativeModule } from '../init.js';

/** Value accepted by a geometry setting setter. */
export type SettingInput = boolean | number | string | number[] | string[];
/** Owned wrapper for native geometry interpretation settings. */
export class Settings extends IfcOpenshellGeomSettings {
  constructor() {
    super(nativeModule().geom.createSettings());
  }

  value(name: string): SettingInput {
    return this.get(name);
  }

  names(): string[] {
    return this.settingNames();
  }
}

/** Values of the dimensionality setting (OutputDimensionalityTypes in conversion_settings.h). */
export const Dimensionality = { CURVES: 0, SURFACES_AND_SOLIDS: 1, CURVES_SURFACES_AND_SOLIDS: 2 } as const;

/** Values of the iterator-output setting (IteratorOutputOptions in conversion_settings.h). */
export const IteratorOutput = { TRIANGULATED: 0, NATIVE: 1, SERIALIZED: 2 } as const;
