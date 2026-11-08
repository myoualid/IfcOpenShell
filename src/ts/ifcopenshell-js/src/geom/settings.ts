
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
