
import type { IfcOpenshellGeomSettings } from '@ifcopenshell-js/wasm/api';
import { IfcOpenShellError, type IfcOpenShell } from '../init.js';
import { HandleGuard } from '../resource.js';
import { requireSession } from '../session.js';

/** Value accepted by a geometry setting setter. */
export type SettingInput = boolean | number | string | number[] | string[];
type SettingType = 'bool' | 'double' | 'int' | 'string' | 'intSet' | 'doubleList' | 'stringSet';

/**
 * Owned wrapper for native geometry interpretation settings.
 * Matches Python `ifcopenshell.geom.settings()` — uses the runtime from
 * {@link init} unless an explicit shell is passed.
 */
export class settings {
  private _raw: IfcOpenshellGeomSettings | null;
  private readonly guard: HandleGuard<IfcOpenshellGeomSettings>;

  constructor(shell?: IfcOpenShell) {
    const runtime = shell ?? requireSession();
    this._raw = runtime.raw.geom.createSettings();
    this.guard = new HandleGuard(this, this._raw, true);
  }

  /** @internal Native settings handle — advanced escape hatch only. */
  get raw(): IfcOpenshellGeomSettings {
    if (this._raw == null) throw new IfcOpenShellError('geom.settings has been disposed');
    return this._raw;
  }

  /** Set a named setting using the native setting type when available. */
  set(name: string, value: SettingInput): void {
    if (typeof value === 'boolean') this.raw.setBool(name, value);
    else if (typeof value === 'string') this.raw.setString(name, value);
    else if (Array.isArray(value)) {
      if (value.every((item): item is string => typeof item === 'string')) this.raw.setStringSet(name, value);
      else if (normalizeSettingType(catchString(() => this.getType(name), 'intSet')) === 'doubleList') {
        this.raw.setDoubleList(name, value);
      } else {
        this.raw.setIntSet(name, value);
      }
    } else if (normalizeSettingType(catchString(() => this.getType(name), 'double')) === 'int') {
      this.raw.setInt(name, value);
    } else {
      this.raw.setDouble(name, value);
    }
  }

  /** Read a named setting. Python: `settings.get(name)`. */
  get(name: string): SettingInput {
    const type = normalizeSettingType(this.getType(name));
    if (type === 'bool') return this.raw.getBool(name);
    if (type === 'int') return this.raw.getInt(name);
    if (type === 'string') return this.raw.getString(name);
    if (type === 'intSet') return this.raw.getIntSet(name);
    if (type === 'doubleList') return this.raw.getDoubleList(name);
    if (type === 'stringSet') return this.raw.getStringSet(name);
    return this.raw.getDouble(name);
  }

  /** Python: `settings.get_type(name)`. */
  getType(name: string): string {
    return this.raw.getType(name);
  }

  /** Python: `settings.setting_names()`. */
  settingNames(): string[] {
    return this.raw.settingNames();
  }

  /** Release the native settings handle. */
  dispose(): void {
    if (this._raw == null) return;
    this.guard.destroy();
    this._raw = null;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.dispose();
  }
}

function normalizeSettingType(type: string): SettingType {
  const trimmed = type.trim();
  const normalized = trimmed.toLowerCase().replace(/[\s_-]+/g, '');
  if (normalized.includes('bool')) return 'bool';
  if (
    normalized.includes('stringset')
    || normalized.includes('set<std::string>')
    || normalized.includes('set<string>')
  ) {
    return 'stringSet';
  }
  if (
    normalized.includes('vector<double>')
    || normalized.includes('doublelist')
    || normalized.includes('listofdouble')
  ) {
    return 'doubleList';
  }
  if (
    normalized.includes('set<int>')
    || normalized.includes('intset')
    || (normalized.includes('set') && normalized.includes('int'))
  ) {
    return 'intSet';
  }
  if (normalized.includes('string')) return 'string';
  if (normalized === 'int' || normalized.includes('integer')) return 'int';
  if (normalized === 'double' || normalized.includes('float')) return 'double';
  // Native enum option types (IteratorOutputOptions, TriangulationMethod, …) are ints.
  if (/options?$|types?$|method$/.test(normalized) || /^[A-Z]/.test(trimmed)) return 'int';
  return 'double';
}

function catchString(fn: () => string, fallback: string): string {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
