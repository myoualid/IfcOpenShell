
import type {
  IfcOpenshellFile,
  IfcOpenshellGeomElement,
  IfcOpenshellGeomIterator,
  IfcOpenshellGeomTaxonomyPoint3,
  IfcOpenshellGeomTriangulation,
  IfcOpenshellGeomTriangulationElement,
} from '@ifcopenshell-js/wasm/api';
import type { IfcFile } from '../file.js';
import { IfcOpenShellError, abortError, type IfcOpenShell } from '../init.js';
import { schemaPluginId } from '../schema.js';
import { HandleGuard } from '../resource.js';
import { settings } from './settings.js';
import type { Mesh, MeshPrecision } from './mesh.js';

/** Include or exclude geometry by IFC type, GlobalId, or numeric id. */
export type IteratorFilter =
  | { kind: 'types'; values: string[]; include?: boolean }
  | { kind: 'guids'; values: string[]; include?: boolean }
  | { kind: 'ids'; values: number[]; include?: boolean };

/** Progress payload emitted while geometry is loaded or iterated. */
export interface OperationProgress {
  /** Current phase, such as `plugin`, `iterate`, `write`, or `done`. */
  phase: string;
  /** Human-readable progress message. */
  message: string;
  /** Normalized progress ratio when available. */
  ratio?: number;
  /** Number of processed items when available. */
  current?: number;
}

/** Current native geometry iterator state and unit information. */
export interface IteratorMetadata {
  /** Whether native geometry initialization has completed. */
  initialized: boolean;
  /** Normalized native processing progress in the range `0..1`. */
  progress: number;
  /** Whether native element processing reported an error. */
  hadError: boolean;
  /** Name of the file's length unit. */
  unitName: string;
  /** Magnitude of the file's length unit in SI units. */
  unitMagnitude: number;
}

/** Options controlling geometry kernel, parallelism, and entity filtering. */
export interface IteratorOptions<P extends MeshPrecision = 'float32'> {
  kernel?: string;
  numThreads?: number;
  filter?: IteratorFilter;
  /**
   * Precision of detached floating geometry snapshots. Defaults to `float32`
   * for WebGL-friendly buffers; use `float64` for CPU-side analytical work.
   */
  precision?: P;
}

/** Options for collecting meshes from an asynchronous iterator. */
export interface CollectOptions {
  limit?: number;
  progressInterval?: number;
  skipEmpty?: boolean;
  /** Checked between synchronous native calls; it cannot interrupt one native call already in progress. */
  signal?: AbortSignal;
  onProgress?(progress: OperationProgress & { meshes: number }): void;
}

/** Meshes and completion metadata returned by {@link iterator.collect}. */
export interface CollectResult<P extends MeshPrecision = 'float32'> {
  meshes: Mesh<P>[];
  truncated: boolean;
  metadata: IteratorMetadata;
}

/** Asynchronous geometry mesh iterator backed by a loaded IFC file. */
export class iterator<P extends MeshPrecision = 'float32'> implements AsyncIterable<Mesh<P>> {
  private rawIter: IfcOpenshellGeomIterator | null = null;
  private guard: HandleGuard<IfcOpenshellGeomIterator> | null = null;
  private initialized = false;
  private initializationAttempted = false;
  private cleanlyEmpty = false;
  private exhausted = false;
  private disposed = false;
  private readonly ready: Promise<IfcOpenshellGeomIterator>;
  private readonly ownedSettings: settings | null;
  private settingsReleased = false;
  private readonly precision: P;

  /** @internal Prefer {@link iterate}. */
  constructor(
    shell: IfcOpenShell,
    file: IfcFile,
    geomSettings: settings,
    options: IteratorOptions<P> = {},
    private readonly ownsSettings = false,
  ) {
    validateTriangulatedOutput(geomSettings);
    this.precision = (options.precision ?? 'float32') as P;
    this.ownedSettings = ownsSettings ? geomSettings : null;
    this.ready = createIterator(shell, file.raw, geomSettings, options).then((raw) => {
      if (this.disposed) {
        raw.destroy();
        this.releaseSettings();
        return raw;
      }
      this.rawIter = raw;
      this.guard = new HandleGuard(this, raw, true);
      return raw;
    }, (error: unknown) => {
      this.releaseSettings();
      throw error;
    });
  }

  /** @internal Native iterator handle — advanced escape hatch only. */
  get raw(): IfcOpenshellGeomIterator {
    if (this.disposed || this.rawIter == null) throw new IfcOpenShellError('iterator has been disposed');
    return this.rawIter;
  }

  /** Return progress, initialization, error, and unit metadata. */
  async metadata(): Promise<IteratorMetadata> {
    const raw = await this.ready;
    if (this.disposed) throw new IfcOpenShellError('iterator has been disposed');
    return {
      initialized: this.initialized,
      progress: normalizeProgress(raw.progress()),
      hadError: raw.hadErrorProcessingElements(),
      unitName: raw.unitName(),
      unitMagnitude: raw.unitMagnitude(),
    };
  }

  /** Initialize the native iterator and report whether initialization succeeded. */
  async initialize(): Promise<boolean> {
    if (this.disposed) throw new IfcOpenShellError('iterator has been disposed');
    if (this.initializationAttempted) return this.initialized;
    const raw = await this.ready;
    const ok = raw.initialize();
    this.initializationAttempted = true;
    this.initialized = ok;
    this.cleanlyEmpty = !ok && !raw.hadErrorProcessingElements();
    return ok;
  }

  /** Compute geometry bounds, optionally forcing full geometry creation. */
  async computeBounds(withGeometry = true): Promise<void> {
    if (this.disposed) throw new IfcOpenShellError('iterator has been disposed');
    if (!await this.initialize()) {
      const raw = await this.ready;
      if (!raw.hadErrorProcessingElements()) return;
      throw new IfcOpenShellError(
        'Failed to initialize iterator before computing bounds; verify the IFC has supported geometry and the selected kernel is available',
      );
    }
    (await this.ready).computeBounds(withGeometry);
  }

  /** Return the computed minimum and maximum points. */
  async bounds(): Promise<{ min: [number, number, number] | null; max: [number, number, number] | null }> {
    const raw = await this.ready;
    if (this.disposed) throw new IfcOpenShellError('iterator has been disposed');
    if (this.cleanlyEmpty) return { min: null, max: null };
    return { min: readPoint3(raw.boundsMin()), max: readPoint3(raw.boundsMax()) };
  }

  async boundsMin(): Promise<[number, number, number] | null> {
    return (await this.bounds()).min;
  }

  async boundsMax(): Promise<[number, number, number] | null> {
    return (await this.bounds()).max;
  }

  /** Advance to the next mesh, returning `null` after exhaustion. */
  async nextMesh(): Promise<Mesh<P> | null> {
    return this.nextWithOptions();
  }

  next(): Promise<Mesh<P> | null> {
    return this.nextMesh();
  }

  /** Consume meshes until exhaustion, a limit, or cancellation. */
  async collect(options: CollectOptions = {}): Promise<CollectResult<P>> {
    const meshes: Mesh<P>[] = [];
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const progressInterval = Math.max(1, options.progressInterval ?? 24);
    let seen = 0;

    while (meshes.length < limit) {
      throwIfAborted(options.signal);
      const mesh = await this.nextWithOptions(options);
      if (!mesh) break;
      seen++;
      if (!options.skipEmpty || (mesh.vertices.length > 0 && mesh.faces.length > 0)) meshes.push(mesh);
      if (seen % progressInterval === 0) {
        const metadata = await this.metadata();
        options.onProgress?.({
          phase: 'iterate',
          message: 'Iterating geometry',
          ratio: metadata.progress,
          current: seen,
          meshes: meshes.length,
        });
      }
    }

    const metadata = await this.metadata();
    const truncated = meshes.length >= limit && !this.exhausted;
    options.onProgress?.({
      phase: 'done',
      message: 'Geometry iteration complete',
      ratio: truncated ? metadata.progress : 1,
      current: seen,
      meshes: meshes.length,
    });
    return { meshes, truncated, metadata };
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Mesh<P>> {
    while (true) {
      const mesh = await this.nextMesh();
      if (!mesh) return;
      yield mesh;
    }
  }

  /** Stop iteration and release the native iterator and owned settings. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rawIter == null) return;
    this.guard?.destroy();
    this.guard = null;
    this.rawIter = null;
    this.releaseSettings();
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.ready.catch(() => undefined);
    this.dispose();
  }

  private releaseSettings(): void {
    if (!this.ownsSettings || this.settingsReleased) return;
    this.settingsReleased = true;
    this.ownedSettings?.dispose();
  }

  private async nextWithOptions(options: { signal?: AbortSignal } = {}): Promise<Mesh<P> | null> {
    throwIfAborted(options.signal);
    if (this.disposed) throw new IfcOpenShellError('iterator has been disposed');
    if (this.exhausted) return null;
    const raw = await this.ready;
    if (!await this.initialize()) {
      this.exhausted = true;
      if (!raw.hadErrorProcessingElements()) return null;
      throw new IfcOpenShellError(
        'Failed to initialize iterator; verify the IFC has supported geometry and the selected kernel is available',
      );
    }
    const mesh = extractMesh(raw, this.precision);
    this.exhausted = !raw.next();
    return mesh;
  }
}

async function createIterator(
  shell: IfcOpenShell,
  file: IfcOpenshellFile,
  geomSettings: settings,
  options: IteratorOptions<MeshPrecision>,
): Promise<IfcOpenshellGeomIterator> {
  const kernel = options.kernel ?? 'passthrough';
  await loadGeometry(shell, file, kernel);
  const raw = createFilteredIterator(shell, kernel, geomSettings, file, options.numThreads ?? 1, options.filter);
  if (!raw || raw.ptr === 0) throw new IfcOpenShellError('Failed to create iterator');
  return raw;
}

function createFilteredIterator(
  shell: IfcOpenShell,
  kernel: string,
  geomSettings: settings,
  file: IfcOpenshellFile,
  threads: number,
  filter?: IteratorFilter,
): IfcOpenshellGeomIterator | null {
  const include = filter?.include ?? true;
  if (filter?.kind === 'types') {
    return shell.raw.geom.createIteratorWithIncludeExclude(kernel, geomSettings.raw, file, filter.values, include, threads);
  }
  if (filter?.kind === 'guids') {
    return shell.raw.geom.createIteratorWithIncludeExcludeGlobalid(kernel, geomSettings.raw, file, filter.values, include, threads);
  }
  if (filter?.kind === 'ids') {
    return shell.raw.geom.createIteratorWithIncludeExcludeId(kernel, geomSettings.raw, file, filter.values, include, threads);
  }
  return shell.raw.geom.createIterator(kernel, geomSettings.raw, file, threads);
}

/**
 * Get a geometry iterator for the provided file.
 * Matches Python `ifcopenshell.geom.iterate(settings, file, …)`.
 */
export function iterate<P extends MeshPrecision = 'float32'>(
  geomSettings: settings,
  file: IfcFile,
  options: {
    numThreads?: number;
    include?: string[] | number[];
    exclude?: string[] | number[];
    geometryLibrary?: string;
    precision?: P;
  } = {},
): iterator<P> {
  const filter = toFilter(options.include, options.exclude);
  return new iterator<P>(
    file.shell,
    file,
    geomSettings,
    {
      kernel: options.geometryLibrary ?? 'opencascade',
      numThreads: options.numThreads ?? 1,
      filter,
      precision: options.precision,
    },
    false,
  );
}

function toFilter(
  include?: string[] | number[],
  exclude?: string[] | number[],
): IteratorFilter | undefined {
  if (include && exclude) {
    throw new IfcOpenShellError('geom.iterate cannot take both include and exclude');
  }
  const values = include ?? exclude;
  if (!values || values.length === 0) return undefined;
  const asInclude = include != null;
  if (typeof values[0] === 'number') {
    return { kind: 'ids', values: values as number[], include: asInclude };
  }
  return { kind: 'types', values: values as string[], include: asInclude };
}

/** @internal Load geometry plugins for a kernel/schema. */
export async function loadGeometry(shell: IfcOpenShell, file: IfcOpenshellFile, kernel: string): Promise<void> {
  const schema = schemaPluginId(file.schemaName());
  await shell.loadPlugin('kernel', kernel);
  await shell.loadPlugin('mapping', schema);
}

export { schemaPluginId } from '../schema.js';

function extractMesh<P extends MeshPrecision>(iter: IfcOpenshellGeomIterator, precision: P): Mesh<P> | null {
  let tri: IfcOpenshellGeomTriangulationElement | null = null;
  let geom: IfcOpenshellGeomTriangulation | null = null;
  try {
    // getAsTriangulationElement() already consumes the current iterator element
    // (same ownership as get()). Do not call get() afterwards.
    tri = iter.getAsTriangulationElement();
    if (!tri || tri.ptr === 0) return null;
    geom = tri.geometry();
    if (!geom || geom.ptr === 0) return null;
    const element = tri as unknown as IfcOpenshellGeomElement;
    const vertices = precision === 'float64' ? geom.vertsBuffer(Float64Array) : geom.vertsBuffer(Float32Array);
    const normals = precision === 'float64' ? geom.normalsBuffer(Float64Array) : geom.normalsBuffer(Float32Array);
    const uvs = precision === 'float64' ? geom.uvsBuffer(Float64Array) : geom.uvsBuffer(Float32Array);
    const colors = precision === 'float64' ? geom.colorsBuffer(Float64Array) : geom.colorsBuffer(Float32Array);
    return {
      id: element.id(),
      guid: element.guid(),
      type: element.type(),
      name: element.name(),
      vertices,
      faces: geom.facesBuffer(Uint32Array),
      normals: normals.length > 0 ? normals : null,
      transform: element.transformationBuffer(Float64Array),
      edges: geom.edgesBuffer(Uint32Array),
      materialIds: geom.materialIdsBuffer(Int32Array),
      itemIds: geom.itemIdsBuffer(Int32Array),
      edgeItemIds: geom.edgesItemIdsBuffer(Int32Array),
      uvs,
      colors,
    } as Mesh<P>;
  } finally {
    release(geom);
    release(tri);
  }
}

function readPoint3(point: IfcOpenshellGeomTaxonomyPoint3 | null): [number, number, number] | null {
  if (!point || point.ptr === 0) return null;
  try {
    const data = point.getData();
    return data && data.length >= 3 ? [data[0]!, data[1]!, data[2]!] : null;
  } finally {
    point.destroy();
  }
}

function release(handle: { destroy(): void } | null | undefined): void {
  handle?.destroy();
}

function validateTriangulatedOutput(geomSettings: settings): void {
  if (geomSettings.get('iterator-output') !== 0) {
    throw new IfcOpenShellError(
      'geom.iterate() requires triangulated geometry; set "iterator-output" to 0 (TRIANGULATED)',
    );
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError('IfcOpenShell operation was cancelled', signal.reason);
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  if (progress > 1) return Math.max(0, Math.min(1, progress / 100));
  return Math.max(0, Math.min(1, progress));
}
