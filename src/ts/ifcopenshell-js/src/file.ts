
import { IfcOpenshellFile } from '@ifcopenshell/wasm/api';
import type { AttributeValueType, EntityInstance } from './entity_instance.js';
import { IfcOpenShellError, abortError, ifcopenshell } from './init.js';

/** Options controlling IFC byte-stream loading. */
export interface OpenOptions {
  /** Abort opening before native parsing begins. */
  signal?: AbortSignal;
  /** Open the native file in read-only mode when supported. */
  readonly?: boolean;
}

export interface GetInverseOptions {
  allowDuplicate?: boolean;
  withAttributeIndices?: boolean;
}

/** Open files by native file pointer, so that an entity can return its File. */
const openFiles = new Map<number, File>();

/** High-level wrapper for an IFC file and its entity graph. */
export class File extends IfcOpenshellFile {
  /** Project units by unit type, which `util/unit` caches here. */
  units: Record<string, EntityInstance> = {};

  private toDeleteSet: Set<EntityInstance> | null = null;

  /**
   * Entities that `util/element` collects to remove in one batch, or null outside a batch.
   * Membership follows entity identity.
   */
  get toDelete(): Set<EntityInstance> | null {
    return this.toDeleteSet;
  }

  set toDelete(value: Iterable<EntityInstance> | null) {
    this.toDeleteSet = value ? new Set(value) : null;
  }

  /** The wrapper of each entity read from this file, by identity(): one wrapper per entity. */
  private readonly entities = new Map<number, EntityInstance>();

  /** @internal The wrapper of the entity with this identity(), if it was read before. */
  entityByIdentity(identity: number): EntityInstance | undefined {
    return this.entities.get(identity);
  }

  /** @internal Keep the wrapper of a newly read entity. */
  rememberEntity(identity: number, entity: EntityInstance): void {
    this.entities.set(identity, entity);
  }

  /** Remove an entity. Its identity() may be reused by a later entity, so its wrapper is dropped. */
  override remove(entity: EntityInstance): void {
    this.entities.delete(entity.identity());
    super.remove(entity);
  }

  /** @internal The open File with this native file pointer, or null. */
  static byPointer(pointer: number): File | null {
    return openFiles.get(pointer) ?? null;
  }

  /** Create an empty file, or take ownership of an existing native file handle. */
  constructor(schemaOrHandle: string | IfcOpenshellFile = 'IFC4') {
    const handle = typeof schemaOrHandle === 'string'
      ? ifcopenshell.parse.newFile(schemaOrHandle, 0, '')
      : schemaOrHandle;
    if (!handle || handle.ptr === 0) throw new IfcOpenShellError('Failed to create IFC file');
    super(handle);
    this.pointer = this.filePointer();
    openFiles.set(this.pointer, this);
  }

  private readonly pointer: number;

  private forget(): void {
    if (openFiles.get(this.pointer) === this) openFiles.delete(this.pointer);
  }

  override destroy(): void {
    this.forget();
    this.entities.clear();
    super.destroy();
  }

  override dispose(): void {
    this.forget();
    this.entities.clear();
    super.dispose();
  }

  /** Open IFC STEP bytes and retain ownership of the native file. */
  static open(
    bytes: Uint8Array | ArrayBuffer,
    filename?: string,
    options: OpenOptions = {},
  ): File {
    if (options.signal?.aborted) {
      throw abortError('Opening IFC file was aborted', options.signal.reason);
    }
    const handle = ifcopenshell.parse.openBytes(bytes, filename, options.readonly ?? false);
    if (options.signal?.aborted) {
      handle?.destroy();
      throw abortError('Opening IFC file was aborted', options.signal.reason);
    }
    if (!handle || handle.ptr === 0) throw new IfcOpenShellError('Failed to open IFC file');
    return new File(handle);
  }

  /** Parse IFC STEP text. */
  static fromString(text: string, options: OpenOptions = {}): File {
    return File.open(new TextEncoder().encode(text), undefined, options);
  }

  get maxId(): number {
    return this.getMaxId();
  }

  get ids(): number[] {
    // The C API yields entities in reverse insertion order; Python iterates by id.
    return this.entityNames().sort((a, b) => a - b);
  }

  get entityCount(): number {
    return this.ids.length;
  }

  declare byId: (id: number) => EntityInstance;
  declare byGuid: (guid: string) => EntityInstance;
  declare byType: (typeName: string) => EntityInstance[];
  declare byTypeExclSubtypes: (typeName: string) => EntityInstance[];
  declare traverse: (entity: EntityInstance, maxDepth: number) => EntityInstance[];
  declare traverseBreadthFirst: (entity: EntityInstance, maxDepth: number) => EntityInstance[];

  /**
   * Create an entity with any of its IFC attributes: by schema name in an object, or by
   * position in an array. An object may also give positions as keys ("0", "1"), so that
   * `{ ...[a], Name: b }` sets the first attribute and `Name`. Give `id` to create the
   * entity with that id.
   */
  create(
    ifcClass: string,
    attributes: Record<string, AttributeValueType> | AttributeValueType[] = {},
    id?: number,
  ): EntityInstance {
    const entity = (id ? this.createEntityByNameWithId(ifcClass, id) : this.createEntityByName(ifcClass)) as EntityInstance | null;
    if (!entity) throw new IfcOpenShellError(`Failed to create ${ifcClass}`);
    try {
      const entries = Array.isArray(attributes)
        ? attributes.map((value, index) => [index, value] as const)
        : Object.entries(attributes).map(([key, value]) => [/^\d+$/.test(key) ? Number(key) : key, value] as const);
      for (const [nameOrIndex, value] of entries) entity.set(nameOrIndex, value);
      return entity;
    } catch (error) {
      this.remove(entity);
      throw error;
    }
  }

  /** Whether every entity that references `entity` has one of `ids`. */
  isReferencedOnlyIn(entity: EntityInstance, ids: Iterable<number>): boolean {
    const allowed = new Set(ids);
    return this.getInverseList(entity).every(inverse => allowed.has(inverse.id()));
  }

  /** The ids, of those given, whose referencing entities all have an id among them. */
  idsReferencedOnlyWithin(ids: Iterable<number>): number[] {
    const within = new Set(ids);
    return [...within].filter(id => this.getInverseList(this.byId(id)).every(inverse => within.has(inverse.id())));
  }

  /** General IFC schema version, without addendum or technical corrigendum suffixes. */
  schema(): string {
    return this.schemaIdentifier().replace(/(_ADD|_TC)\d+.*$/, '');
  }

  /** Add an entity, assigning a new id unless `instanceId` is given explicitly. */
  override add(entity: EntityInstance, instanceId = -1): EntityInstance {
    const added = super.add(entity, instanceId) as EntityInstance | null;
    if (!added) throw new IfcOpenShellError(`Failed to add ${entity.isA()} to file`);
    return added;
  }

  getInverse(entity: EntityInstance, options: { allowDuplicate?: false; withAttributeIndices?: false }): Set<EntityInstance>;
  getInverse(entity: EntityInstance, options: { allowDuplicate: true; withAttributeIndices: true }): [EntityInstance, number][];
  getInverse(entity: EntityInstance, options: { allowDuplicate: true; withAttributeIndices?: false }): EntityInstance[];
  getInverse(entity: EntityInstance): Set<EntityInstance>;
  getInverse(entity: EntityInstance, options: GetInverseOptions): Set<EntityInstance> | EntityInstance[] | [EntityInstance, number][];
  getInverse(entity: EntityInstance, options: GetInverseOptions = {}): Set<EntityInstance> | EntityInstance[] | [EntityInstance, number][] {
    const { allowDuplicate = false, withAttributeIndices = false } = options;
    if (withAttributeIndices && !allowDuplicate) {
      throw new IfcOpenShellError('withAttributeIndices requires allowDuplicate to be true');
    }
    const entities = this.getInverseList(entity) as EntityInstance[];
    if (withAttributeIndices) {
      const indices = this.getInverseIndices(entity);
      return entities.map((item, i) => [item, indices[i]!] as [EntityInstance, number]);
    }
    if (allowDuplicate) return entities;
    return new Set(entities);
  }


}

/** Parse IFC bytes after explicitly loading their schema plugin. */
export function open(bytes: Uint8Array | ArrayBuffer, filename?: string, options?: OpenOptions): File {
  return File.open(bytes, filename, options);
}

const resources = new Map<string, Uint8Array>();

/**
 * Provide the bytes of a data file that code opens by path, such as the property set
 * templates that `util/pset` reads. Browsers have no file system to read them from.
 * The key is the file name, or the end of its path or URL.
 */
export function registerResource(path: string, bytes: Uint8Array | ArrayBuffer): void {
  resources.set(path.replace(/\\/g, '/'), bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

/**
 * Read a data file by path or file URL: the bytes given to {@link registerResource} for a
 * matching path, else the file system when one is available (Node).
 */
export function readResource(path: string): Uint8Array {
  const normalized = path.replace(/\\/g, '/');
  for (const [key, bytes] of resources) {
    if (normalized === key || normalized.endsWith(`/${key}`)) return bytes;
  }
  const fs = (globalThis as { process?: { getBuiltinModule?(name: string): unknown } }).process?.getBuiltinModule?.('node:fs') as
    | { readFileSync(path: string | URL): Uint8Array }
    | undefined;
  if (!fs) throw new IfcOpenShellError(`No file system to read ${path}; provide it with registerResource()`);
  return fs.readFileSync(normalized.startsWith('file:') ? new URL(normalized) : normalized);
}

/** Open an IFC file by path or file URL; see {@link registerResource}. */
export function openPath(path: string, options?: OpenOptions): File {
  return File.open(readResource(path), path.replace(/\\/g, '/'), options);
}
