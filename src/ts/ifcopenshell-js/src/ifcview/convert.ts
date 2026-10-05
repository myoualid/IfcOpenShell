import type { IfcFile } from '../file.js';
import { iterate, type OperationProgress } from '../geom/iterator.js';
import { settings as GeomSettings } from '../geom/settings.js';
import { open } from '../session.js';
import { buildElementMetadataMap } from './context.js';
import { detectFormat } from './detect.js';
import { SidecarMeshAccumulator } from './sidecar/mesh-builder.js';
import { writeViewerSidecarBytes } from './sidecar/serialize.js';
import type { SidecarElementMetadata } from './sidecar/types.js';

/** Geometry kernel / library used during IFC tessellation. */
export const DEFAULT_GEOMETRY_LIBRARY = 'opencascade' as const;

/** IFC product types excluded from sidecar tessellation. */
export const GEOMETRY_EXCLUDED_TYPES = ['IfcAnnotation', 'IfcOpeningElement'] as const;

/** Options for IFC → `.ifcview` conversion. */
export interface ConvertOptions {
  /** Geometry kernel plugin id (`opencascade`, `passthrough`, `manifold`, …). */
  geometryLibrary?: string;
  /** Number of native geometry iterator threads. */
  numThreads?: number;
  /** Viewer model id written into instance/element records. Defaults to `1`. */
  modelId?: number;
  /** Abort between geometry elements. */
  signal?: AbortSignal;
  /** Progress while parsing / tessellating / serializing. */
  onProgress?(progress: OperationProgress): void;
}

/** Result of converting IFC geometry to `.ifcview` bytes. */
export interface ConvertResult {
  /** Serialized viewer-native `.ifcview` sidecar. */
  sidecarBytes: Uint8Array;
  /** Unique deduplicated mesh count written into the sidecar. */
  meshCount: number;
  /** Product count discovered while building element metadata. */
  productCount: number;
}

const TESSELLATION_SPAN = 0.6;
const TESSELLATION_START = 0.25;

async function tessellateToAccumulator(
  file: IfcFile,
  metadata: ReadonlyMap<number, SidecarElementMetadata>,
  options: ConvertOptions,
): Promise<SidecarMeshAccumulator> {
  const geometryLibrary = options.geometryLibrary ?? DEFAULT_GEOMETRY_LIBRARY;
  const geomSettings = new GeomSettings();
  const accumulator = new SidecarMeshAccumulator();
  const iter = iterate(geomSettings, file, {
    geometryLibrary,
    numThreads: options.numThreads ?? 1,
    exclude: [...GEOMETRY_EXCLUDED_TYPES],
  });

  let tessellatedCount = 0;
  try {
    if (!(await iter.initialize())) {
      throw new Error(
        `Geometry iterator failed (geometryLibrary: ${geometryLibrary}). ` +
          'Confirm the kernel plugin is staged in the WASM assets.',
      );
    }

    for await (const mesh of iter) {
      if (options.signal?.aborted) {
        throw new Error('IFC → ifcview conversion was aborted');
      }
      accumulator.appendMesh(mesh, metadata);
      tessellatedCount += 1;

      if (tessellatedCount === 1 || tessellatedCount % 25 === 0) {
        options.onProgress?.({
          phase: 'tessellating',
          message: `Tessellating ${tessellatedCount.toLocaleString()} elements (${accumulator.uniqueMeshCount.toLocaleString()} meshes)…`,
          ratio: TESSELLATION_START + Math.min(tessellatedCount / Math.max(metadata.size, 1), 1) * TESSELLATION_SPAN,
          current: tessellatedCount,
        });
      }
    }
  } finally {
    iter.dispose();
    geomSettings.dispose();
  }

  return accumulator;
}

/**
 * Tessellate an opened {@link IfcFile} and serialize a viewer `.ifcview` sidecar.
 *
 * Requires a prior {@link init} so geometry plugins can load.
 */
export async function convert(file: IfcFile, options: ConvertOptions = {}): Promise<ConvertResult> {
  options.onProgress?.({ phase: 'parsing', message: 'Collecting product metadata…', ratio: 0.08 });
  const metadata = buildElementMetadataMap(file);
  const tessellatableCount = [...metadata.values()].filter(
    (entry) => !GEOMETRY_EXCLUDED_TYPES.includes(entry.type as (typeof GEOMETRY_EXCLUDED_TYPES)[number]),
  ).length;

  if (tessellatableCount === 0) {
    throw new Error('No tessellatable elements found in IFC model.');
  }

  options.onProgress?.({
    phase: 'parsed',
    message: `Parsed ${metadata.size.toLocaleString()} products (${tessellatableCount.toLocaleString()} with geometry)…`,
    ratio: 0.22,
    current: metadata.size,
  });

  const accumulator = await tessellateToAccumulator(file, metadata, options);
  if (accumulator.uniqueMeshCount === 0) {
    throw new Error('Tessellation produced no visible geometry.');
  }

  options.onProgress?.({
    phase: 'serializing',
    message: `Building sidecar (${accumulator.uniqueMeshCount.toLocaleString()} meshes)…`,
    ratio: 0.88,
    current: accumulator.uniqueMeshCount,
  });

  const sidecarBytes = await writeViewerSidecarBytes(
    accumulator.build(metadata, { modelId: options.modelId }),
  );

  options.onProgress?.({
    phase: 'complete',
    message: `Sidecar ready (${accumulator.uniqueMeshCount.toLocaleString()} meshes)…`,
    ratio: 1,
    current: accumulator.uniqueMeshCount,
  });

  return {
    sidecarBytes,
    meshCount: accumulator.uniqueMeshCount,
    productCount: metadata.size,
  };
}

/**
 * Open IFC bytes, tessellate, and return `.ifcview` bytes.
 * Does not dispose the temporary file until conversion finishes.
 */
export async function convertBytes(
  bytes: Uint8Array | ArrayBuffer,
  filename = 'model.ifc',
  options: ConvertOptions = {},
): Promise<ConvertResult> {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const format = detectFormat(view, filename);
  if (format === 'ifcview') {
    options.onProgress?.({
      phase: 'complete',
      message: 'Input is already an .ifcview sidecar…',
      ratio: 1,
    });
    return { sidecarBytes: view.slice(), meshCount: 0, productCount: 0 };
  }
  if (format !== 'ifc-spf' && format !== 'unknown') {
    throw new Error(`Unsupported input format for ifcview conversion: ${format} (${filename})`);
  }

  options.onProgress?.({ phase: 'parsing', message: `Opening ${filename}…`, ratio: 0.05 });
  const file = await open(view, filename);
  try {
    return await convert(file, options);
  } finally {
    file.dispose();
  }
}
