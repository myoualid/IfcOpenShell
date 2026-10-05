
import type { IfcOpenshellFile } from '@ifcopenshell-js/wasm/api';
import { Entity, forgetEntitiesForFile, wrapInstanceList, type AttributeInput } from './entity.js';
import { IfcOpenShellError, abortError, type IfcOpenShell } from './init.js';
import { HandleGuard } from './resource.js';

/** Options controlling IFC byte-stream loading. */
export interface OpenOptions {
  /** Abort opening before native parsing begins. */
  signal?: AbortSignal;
  /** Open the native file in read-only mode when supported. */
  readonly?: boolean;
}

/** Header values exposed from an IFC file's STEP header. */
export interface HeaderInfo {
  description: string[];
  implementationLevel: string;
  name: string;
  timeStamp: string;
  author: string[];
  organization: string[];
  preprocessorVersion: string;
  originatingSystem: string;
  authorization: string;
  schemas: string[];
}

/** High-level wrapper for an IFC file and its entity graph. */
export class IfcFile {
  private _raw: IfcOpenshellFile | null;
  private readonly guard: HandleGuard<IfcOpenshellFile>;

  private constructor(
    private readonly _shell: IfcOpenShell,
    raw: IfcOpenshellFile,
    owned = true,
  ) {
    this._raw = raw;
    this.guard = new HandleGuard(this, raw, owned);
  }

  /** @internal Prefer module-level {@link open}. */
  static async open(
    shell: IfcOpenShell,
    bytes: Uint8Array | ArrayBuffer,
    filename?: string,
    options: OpenOptions = {},
  ): Promise<IfcFile> {
    if (options.signal?.aborted) {
      throw abortError('Opening IFC file was aborted', options.signal.reason);
    }
    const raw = shell.raw.parse.openBytes(bytes, filename, options.readonly ?? false);
    if (options.signal?.aborted) {
      raw?.destroy();
      throw abortError('Opening IFC file was aborted', options.signal.reason);
    }
    if (!raw || raw.ptr === 0) throw new IfcOpenShellError('Failed to open IFC file');
    return new IfcFile(shell, raw);
  }

  /** @internal Prefer module-level {@link file}. */
  static async create(shell: IfcOpenShell, schema: string): Promise<IfcFile> {
    const raw = shell.raw.parse.newFile(schema, 0, '');
    if (!raw || raw.ptr === 0) throw new IfcOpenShellError(`Failed to create ${schema} file`);
    return new IfcFile(shell, raw);
  }

  /** @internal Wrap a native file handle — package use only. */
  static wrap(shell: IfcOpenShell, raw: IfcOpenshellFile | null, owned = false): IfcFile | null {
    return raw && raw.ptr !== 0 ? new IfcFile(shell, raw, owned) : null;
  }

  /** @internal Runtime that owns this file — package / advanced use only. */
  get shell(): IfcOpenShell {
    return this._shell;
  }

  /** @internal Native file handle — advanced escape hatch only. */
  get raw(): IfcOpenshellFile {
    if (this._raw == null) throw new IfcOpenShellError('IfcFile has been disposed');
    return this._raw;
  }

  /** General IFC schema version: IFC2X3, IFC4, IFC4X3. */
  get schema(): string {
    return this.raw.schemaName();
  }

  /** Read the STEP header, returning `null` when no header is available. */
  header(): HeaderInfo | null {
    const header = this.raw.header();
    if (!header || header.ptr === 0) return null;
    try {
      const description = header.fileDescription();
      const name = header.fileName();
      const schema = header.fileSchema();
      try {
        return {
          description: description.description(),
          implementationLevel: description.implementationLevel(),
          name: name.name(),
          timeStamp: name.timeStamp(),
          author: name.author(),
          organization: name.organization(),
          preprocessorVersion: name.preprocessorVersion(),
          originatingSystem: name.originatingSystem(),
          authorization: name.authorization(),
          schemas: schema.schemaIdentifiers(),
        };
      } finally {
        schema.destroy();
        name.destroy();
        description.destroy();
      }
    } finally {
      header.destroy();
    }
  }

  /** Return an entity by numeric STEP id, or `null` when it is absent. Python: `by_id`. */
  byId(id: number): Entity | null {
    return Entity.wrap(this._shell, catchNull(() => this.raw.byId(id)));
  }

  /** Return an entity by GlobalId, or `null` when it is absent. Python: `by_guid`. */
  byGuid(guid: string): Entity | null {
    return Entity.wrap(this._shell, catchNull(() => this.raw.byGuid(guid)));
  }

  /**
   * Return entities of a type. Subtypes are included unless
   * `includeSubtypes` is false. Python: `by_type`.
   */
  byType(typeName: string, options: { includeSubtypes?: boolean } = {}): Entity[] {
    const list = options.includeSubtypes === false
      ? this.raw.byTypeExclSubtypes(typeName)
      : this.raw.byType(typeName);
    return wrapInstanceList(this._shell, list);
  }

  /** Create an entity with IFC attribute fields. Python: `create_entity`. */
  createEntity(ifcClass: string, attributes: Record<string, AttributeInput | undefined> = {}): Entity {
    const { id, ...fields } = attributes;
    const raw = typeof id === 'number'
      ? this.raw.createEntityByNameWithId(ifcClass, id)
      : this.raw.createEntityByName(ifcClass);
    const entity = Entity.wrap(this._shell, raw);
    if (!entity) throw new IfcOpenShellError(`Failed to create ${ifcClass}`);
    for (const [name, value] of Object.entries(fields)) {
      if (value !== undefined) entity.set(name, value);
    }
    return entity;
  }

  /** Serialize the file as STEP text. Python: `str(file)` / `to_string`. */
  toString(): string {
    return this.raw.toString();
  }

  write(path: string): void {
    this.raw.write(path);
  }

  /**
   * Return entities that reference `inst`.
   * Python: `file.get_inverse(inst, allow_duplicate=…, with_attribute_indices=…)`.
   */
  getInverse(
    inst: Entity,
    options: { allowDuplicate?: boolean; withAttributeIndices?: boolean } = {},
  ): Entity[] | Set<Entity> | Array<[Entity, number]> {
    const allowDuplicate = options.allowDuplicate === true;
    const withIndices = options.withAttributeIndices === true;
    if (withIndices && !allowDuplicate) {
      throw new IfcOpenShellError('withAttributeIndices requires allowDuplicate to be true');
    }
    const inverses = wrapInstanceList(this._shell, this.raw.getInverse(inst.raw));
    if (allowDuplicate) {
      if (withIndices) {
        const idxs = this.raw.getInverseIndices(inst.raw);
        return inverses.map((entity, i): [Entity, number] => [entity, idxs[i] ?? -1]);
      }
      return inverses;
    }
    return new Set(inverses);
  }

  /** Python: `file.get_total_inverses(inst)`. */
  getTotalInverses(inst: Entity): number {
    return this.raw.getTotalInverses(inst.raw);
  }

  /**
   * Traverse references from `inst`.
   * Python: `file.traverse(inst, max_levels=…, breadth_first=…)`.
   */
  traverse(
    inst: Entity,
    options: { maxLevels?: number | null; breadthFirst?: boolean } = {},
  ): Entity[] {
    const maxLevels = options.maxLevels ?? -1;
    const list = options.breadthFirst
      ? this.raw.traverseBreadthFirst(inst.raw, maxLevels)
      : this.raw.traverse(inst.raw, maxLevels);
    return wrapInstanceList(this._shell, list);
  }

  /** Release the native file handle. Safe to call more than once. */
  dispose(): void {
    if (this._raw == null) return;
    forgetEntitiesForFile(this._raw.filePointer());
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

function catchNull<T>(fn: () => T): T | null {
  try {
    const value = fn();
    return value && typeof value === 'object' && 'ptr' in value && value.ptr === 0 ? null : value;
  } catch {
    return null;
  }
}
