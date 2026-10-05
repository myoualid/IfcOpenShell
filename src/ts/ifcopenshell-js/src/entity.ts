
import type { IfcOpenshellInstance } from '@ifcopenshell-js/wasm/api';
import { AttributeValue, type IfcValue } from './attribute.js';
import { IfcOpenShellError, type IfcOpenShell } from './init.js';
import { HandleGuard } from './resource.js';

/** Values accepted by {@link Entity.set}. */
export type AttributeInput =
  | null
  | boolean
  | 'UNKNOWN'
  | number
  | string
  | Entity
  | Entity[]
  | Entity[][]
  | number[]
  | number[][]
  | string[];

/** Nested plain-object values returned by recursive {@link Entity.getInfo}. */
export type EntityInfoValue = IfcValue | EntityInfo | EntityInfo[];

/** Plain-object snapshot returned by {@link Entity.getInfo}. */
export interface EntityInfo {
  id?: number;
  type: string;
  [attribute: string]: EntityInfoValue | undefined;
}

const ATTRIBUTE_FORWARD = 1;
const ATTRIBUTE_INVERSE = 2;
const liveEntities = new Map<string, Entity>();

function liveKey(raw: IfcOpenshellInstance): string {
  return `${raw.filePointer()}:${raw.id()}`;
}

/** Drop cached entity wrappers when their owning file is disposed. */
export function forgetEntitiesForFile(filePointer: number): void {
  const prefix = `${filePointer}:`;
  const stale = [...liveEntities.entries()].filter(([key]) => key.startsWith(prefix));
  for (const [key, entity] of stale) {
    liveEntities.delete(key);
    try {
      entity.dispose();
    } catch {
      /* already released */
    }
  }
}

/** High-level wrapper for one IFC entity instance. */
export class Entity {
  [ifcAttribute: string]: any;

  private _raw: IfcOpenshellInstance | null;
  private readonly guard: HandleGuard<IfcOpenshellInstance>;
  private readonly cacheKey: string;

  private constructor(
    private readonly _shell: IfcOpenShell,
    raw: IfcOpenshellInstance,
    owned = true,
  ) {
    this._raw = raw;
    this.cacheKey = liveKey(raw);
    this.guard = new HandleGuard(this, raw, owned);
    return new Proxy(this, ENTITY_PROXY);
  }

  /** @internal Wrap a native instance handle — package use only. */
  static wrap(shell: IfcOpenShell, raw: IfcOpenshellInstance | null, owned = true): Entity | null {
    if (!raw || raw.ptr === 0) return null;
    const existing = liveEntities.get(liveKey(raw));
    if (existing && existing._raw != null) {
      if (owned) {
        try {
          raw.destroy();
        } catch {
          /* duplicate native handle */
        }
      }
      return existing;
    }
    const entity = new Entity(shell, raw, owned);
    liveEntities.set(entity.cacheKey, entity);
    return entity;
  }

  /** @internal Runtime that owns this entity — package / advanced use only. */
  get shell(): IfcOpenShell {
    return this._shell;
  }

  /** @internal Native entity handle — advanced escape hatch only. */
  get raw(): IfcOpenshellInstance {
    if (this._raw == null) throw new IfcOpenShellError('Entity has been disposed');
    return this._raw;
  }

  /** STEP express id, matching Python `entity.id()`. */
  id(): number {
    return this.raw.id();
  }

  /** Python: `is_a`. */
  isA(): string;
  isA(withSchema: boolean): string;
  isA(className: string): boolean;
  isA(arg?: string | boolean): string | boolean {
    if (typeof arg === 'string') return this.raw.isA(arg);
    return this.raw.className(arg === true);
  }

  /**
   * Escape hatch: typed view over one native attribute value.
   * Prefer property access (`entity.Name`).
   */
  attribute(nameOrIndex: string | number): AttributeValue {
    const raw = typeof nameOrIndex === 'string'
      ? this.raw.getArgumentByName(nameOrIndex)
      : this.raw.getArgument(nameOrIndex);
    return new AttributeValue(this._shell, raw);
  }

  /**
   * Escape hatch: read and decode an attribute by name or zero-based index.
   * Prefer property access (`entity.Name`).
   */
  get(nameOrIndex: string | number): IfcValue {
    using attribute = this.attribute(nameOrIndex);
    return attribute.value();
  }

  /**
   * Return a dictionary of the entity's properties.
   * Python: `entity.get_info()`.
   */
  getInfo(options: {
    includeIdentifier?: boolean;
    recursive?: boolean;
    ignore?: string[];
    scalarOnly?: boolean;
  } = {}): EntityInfo {
    const ignore = new Set(options.ignore ?? []);
    const includeIdentifier = options.includeIdentifier !== false;
    const attributes = this.raw.getAttributeNames();
    const info: EntityInfo = { type: this.isA() };
    if (includeIdentifier) info.id = this.id();
    for (const name of attributes) {
      if (ignore.has(name)) continue;
      const value = this.get(name);
      if (options.scalarOnly && value instanceof Entity) continue;
      if (options.recursive && value instanceof Entity) {
        info[name] = value.getInfo(options);
        continue;
      }
      if (options.recursive && Array.isArray(value) && value.every((item) => item instanceof Entity)) {
        info[name] = value.map((item) => item.getInfo(options));
        continue;
      }
      info[name] = value;
    }
    return info;
  }

  /** Python: `entity.attribute_name(attr_idx)`. */
  attributeName(attrIdx: number): string {
    return this.raw.getArgumentName(attrIdx);
  }

  /** Python: `entity.attribute_type(attr)`. */
  attributeType(attr: string | number): string {
    const index = typeof attr === 'number' ? attr : this.raw.getArgumentIndex(attr);
    return this.raw.getArgumentType(index);
  }

  /**
   * Escape hatch: set an attribute, inferring the native value kind.
   * Prefer property assignment (`entity.Name = value`).
   */
  set(nameOrIndex: string | number, value: AttributeInput, options: { type?: string } = {}): void {
    const index = typeof nameOrIndex === 'number' ? nameOrIndex : this.raw.getArgumentIndex(nameOrIndex);
    const nativeType = this.raw.getArgumentType(index);
    if (options.type !== undefined && normalizeArgumentType(options.type) !== normalizeArgumentType(nativeType)) {
      throw new TypeError(`Attribute ${attributeLabel(this, nameOrIndex)} has native type ${nativeType}, not ${options.type}`);
    }
    setArgument(this._shell, this.raw, index, value, nativeType, attributeLabel(this, nameOrIndex));
  }

  /** Serialize the entity as STEP text. Python: `to_string`. */
  toString(validSpf = true): string {
    return this.raw.toString(validSpf);
  }

  /** Release the native entity handle. Safe to call more than once. */
  dispose(): void {
    if (this._raw == null) return;
    liveEntities.delete(this.cacheKey);
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

type InstanceList = { size(): number; get(index: number): IfcOpenshellInstance | null; destroy(): void };

/** @internal */
export function wrapInstanceList(shell: IfcOpenShell, list: InstanceList): Entity[] {
  try {
    const out: Entity[] = [];
    for (let i = 0; i < list.size(); i++) {
      const item = Entity.wrap(shell, list.get(i));
      if (item) out.push(item);
    }
    return out;
  } finally {
    list.destroy();
  }
}

function resolveAttribute(entity: Entity, name: string): IfcValue {
  const category = entity.raw.getAttributeCategory(name);
  if (category === ATTRIBUTE_INVERSE) {
    return wrapInstanceList(entity.shell, entity.raw.getInverse(name));
  }
  if (category === ATTRIBUTE_FORWARD) return entity.get(name);
  throw new IfcOpenShellError(
    `entity instance of type '${entity.isA(true)}' has no attribute '${name}'`,
  );
}

const ENTITY_PROXY: ProxyHandler<Entity> = {
  get(target, prop, receiver) {
    if (typeof prop !== 'string' || prop in target) {
      return Reflect.get(target, prop, receiver);
    }
    return resolveAttribute(target, prop);
  },
  set(target, prop, value, receiver) {
    if (typeof prop !== 'string' || prop in target) {
      return Reflect.set(target, prop, value, receiver);
    }
    target.set(prop, value as AttributeInput);
    return true;
  },
};

function setArgument(
  shell: IfcOpenShell,
  entity: IfcOpenshellInstance,
  index: number,
  value: AttributeInput,
  typeName: string,
  label: string,
): void {
  if (value === null) {
    entity.unsetArgument(index);
    return;
  }

  const type = normalizeArgumentType(typeName);
  if (type === 'BOOL') {
    requireType(value, 'boolean', label, typeName);
    entity.setArgumentBool(index, value);
  } else if (type === 'LOGICAL') {
    if (value !== true && value !== false && value !== 'UNKNOWN') invalidValue(label, typeName, value);
    entity.setArgumentLogical(index, value === true ? 1 : value === false ? 0 : -1);
  } else if (type === 'INT') {
    requireInteger(value, label, typeName);
    entity.setArgumentInt32(index, value);
  } else if (type === 'DOUBLE') {
    requireType(value, 'number', label, typeName);
    entity.setArgumentDouble(index, value);
  } else if (type === 'STRING' || type === 'BINARY') {
    requireType(value, 'string', label, typeName);
    entity.setArgumentString(index, value);
  } else if (type === 'ENUMERATION') {
    requireType(value, 'string', label, typeName);
    if (!entity.setArgumentEnumerationByName(index, value)) invalidValue(label, typeName, value);
  } else if (type === 'ENTITY INSTANCE') {
    if (!(value instanceof Entity)) invalidValue(label, typeName, value);
    requireSameFile(entity, [value], label);
    entity.setArgumentInstance(index, value.raw);
  } else if (type === 'AGGREGATE OF ENTITY INSTANCE') {
    const values = requireArray(value, (item): item is Entity => item instanceof Entity, label, typeName);
    requireSameFile(entity, values, label);
    const list = shell.raw.parse.instanceListCreateFromHandles(values.map((item) => item.raw));
    try {
      entity.setArgumentInstanceList(index, list);
    } finally {
      list.destroy();
    }
  } else if (type === 'AGGREGATE OF STRING') {
    entity.setArgumentStringList(index, requireArray(value, isString, label, typeName));
  } else if (type === 'AGGREGATE OF INT') {
    entity.setArgumentInt32List(index, requireArray(value, isInteger, label, typeName));
  } else if (type === 'AGGREGATE OF DOUBLE') {
    entity.setArgumentDoubleList(index, requireArray(value, isNumber, label, typeName));
  } else if (type === 'AGGREGATE OF AGGREGATE OF INT') {
    entity.setArgumentInt32ListList(index, requireNestedArray(value, isInteger, label, typeName));
  } else if (type === 'AGGREGATE OF AGGREGATE OF DOUBLE') {
    entity.setArgumentDoubleListList(index, requireNestedArray(value, isNumber, label, typeName));
  } else if (type === 'AGGREGATE OF AGGREGATE OF ENTITY INSTANCE') {
    const values = requireNestedArray(value, (item): item is Entity => item instanceof Entity, label, typeName);
    requireSameFile(entity, values.flat(), label);
    entity.setArgumentAsAggregateOfAggregateOfEntityInstance(index, values.map((row) => row.map((item) => item.id())));
  } else {
    throw new TypeError(`Attribute ${label} has unsupported native IFC type ${typeName}`);
  }
}

function normalizeArgumentType(type: string): string {
  return type.trim().toUpperCase().replace(/[\s_-]+/g, ' ');
}

function attributeLabel(entity: Entity, nameOrIndex: string | number): string {
  return `${entity.isA()}.${typeof nameOrIndex === 'number' ? entity.attributeName(nameOrIndex) : nameOrIndex}`;
}

function requireType<T extends 'boolean' | 'number' | 'string'>(
  value: AttributeInput,
  expected: T,
  label: string,
  typeName: string,
): asserts value is T extends 'boolean' ? boolean : T extends 'number' ? number : string {
  if (typeof value !== expected) invalidValue(label, typeName, value);
}

function requireInteger(value: AttributeInput, label: string, typeName: string): asserts value is number {
  if (!isInteger(value)) invalidValue(label, typeName, value);
}

function requireArray<T>(
  value: AttributeInput,
  predicate: (item: unknown) => item is T,
  label: string,
  typeName: string,
): T[] {
  if (!Array.isArray(value) || !value.every(predicate)) invalidValue(label, typeName, value);
  return value as T[];
}

function requireNestedArray<T>(
  value: AttributeInput,
  predicate: (item: unknown) => item is T,
  label: string,
  typeName: string,
): T[][] {
  if (!Array.isArray(value) || !value.every((row) => Array.isArray(row) && row.every(predicate))) {
    invalidValue(label, typeName, value);
  }
  return value as T[][];
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function requireSameFile(target: IfcOpenshellInstance, references: Entity[], label: string): void {
  const targetFile = target.filePointer();
  for (const reference of references) {
    if (reference.raw.filePointer() !== targetFile) {
      throw new TypeError(`Attribute ${label} cannot reference Entity #${reference.id()} from a different IFC file`);
    }
  }
}

function invalidValue(label: string, typeName: string, value: unknown): never {
  const shape = Array.isArray(value) ? 'array' : value instanceof Entity ? 'Entity' : typeof value;
  throw new TypeError(`Attribute ${label} expects ${typeName}; received incompatible ${shape} value`);
}
