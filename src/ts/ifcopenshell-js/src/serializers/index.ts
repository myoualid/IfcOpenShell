
/**
 * Serializer APIs matching Python `ifcopenshell.geom.serializers`.
 *
 * Browser/WASM adaptation: write into in-memory text buffers instead of paths.
 *
 * @module Serializers
 */

import '../disposable.js';

import type {
  IfcOpenshellGeomBrepElement,
  IfcOpenshellGeomBuffer,
  IfcOpenshellGeomGeometrySerializer,
  IfcOpenshellGeomIterator,
  IfcOpenshellGeomTriangulationElement,
} from '@ifcopenshell-js/wasm/api';
import type { IfcFile } from '../file.js';
import { loadGeometry, type OperationProgress } from '../geom/iterator.js';
import type { settings } from '../geom/settings.js';
import { IfcOpenShellError, abortError, type IfcOpenShell } from '../init.js';

/** Formats supported by the geometry serializers. */
export type SerializerFormat = 'obj' | 'svg' | 'ttl';

/** Text buffers returned by a serializer; OBJ uses `secondary` for MTL data. */
export interface ExportResult {
  /** Primary serialized content. */
  primary: string;
  /** Secondary content, used for the OBJ material file. */
  secondary: string;
}

/** Geometry loading, serializer, cancellation, and progress options. */
export interface ExportOptions {
  /** Geometry kernel / library to load before export. Defaults to `opencascade`. */
  geometryLibrary?: string;
  /** Number of native geometry iterator threads. */
  numThreads?: number;
  /**
   * Abort the export between geometry elements. Checked between synchronous
   * native calls; it cannot interrupt one native call already in progress.
   */
  signal?: AbortSignal;
  /** Receive plugin, write, and completion progress events. */
  onProgress?(progress: OperationProgress): void;
}

/** Serialize geometry to OBJ (+ MTL in `secondary`). */
export function obj(
  shell: IfcOpenShell,
  file: IfcFile,
  geomSettings: settings,
  options?: ExportOptions,
): Promise<ExportResult | null> {
  return serialize(shell, file, geomSettings, 'obj', options);
}

/** Serialize geometry to SVG. */
export function svg(
  shell: IfcOpenShell,
  file: IfcFile,
  geomSettings: settings,
  options?: ExportOptions,
): Promise<ExportResult | null> {
  return serialize(shell, file, geomSettings, 'svg', options);
}

/** Serialize geometry to Turtle / IFC-TTL. */
export function ttl(
  shell: IfcOpenShell,
  file: IfcFile,
  geomSettings: settings,
  options?: ExportOptions,
): Promise<ExportResult | null> {
  return serialize(shell, file, geomSettings, 'ttl', options);
}

async function serialize(
  shell: IfcOpenShell,
  file: IfcFile,
  geomSettings: settings,
  format: SerializerFormat,
  options: ExportOptions = {},
): Promise<ExportResult | null> {
  throwIfAborted(options.signal);
  const kernel = options.geometryLibrary ?? 'opencascade';
  options.onProgress?.({ phase: 'plugin', message: `Loading ${kernel} kernel` });
  await loadGeometry(shell, file.raw, kernel);
  options.onProgress?.({ phase: 'plugin', message: `Loading ${format} serializer` });
  await shell.loadPlugin('geometry_serializer', format);

  let objBuf: IfcOpenshellGeomBuffer | null = null;
  let mtl: IfcOpenshellGeomBuffer | null = null;
  let serializer: IfcOpenshellGeomGeometrySerializer | null = null;
  let geomIterator: IfcOpenshellGeomIterator | null = null;
  let outputPath: string | null = null;

  try {
    if (format === 'obj') {
      objBuf = shell.raw.geom.createBuffer();
      mtl = shell.raw.geom.createBuffer();
      serializer = shell.raw.geom.createGeometrySerializerByStream(
        'obj', mtl, objBuf, geomSettings.raw,
      );
    } else {
      outputPath = uniquePath(format);
      serializer = shell.raw.geom.createGeometrySerializerByPath(
        format, outputPath, outputPath, geomSettings.raw,
      );
    }
    if (!serializer || serializer.ptr === 0) throw new IfcOpenShellError(`Failed to create ${format} serializer`);
    serializer.setFile(file.raw);
    serializer.writeHeader();

    geomIterator = shell.raw.geom.createIterator(kernel, geomSettings.raw, file.raw, options.numThreads ?? 1);
    if (!geomIterator || geomIterator.ptr === 0) throw new IfcOpenShellError('Failed to create geometry iterator');
    if (!geomIterator.initialize()) return null;

    const preferTriangulation = serializer.isTesselated();
    let written = 0;
    do {
      throwIfAborted(options.signal);
      writeElement(geomIterator, serializer, preferTriangulation);
      written++;
      if (written % 16 === 0) {
        options.onProgress?.({
          phase: 'write',
          message: `Exporting ${format}`,
          current: written,
          ratio: progressRatio(geomIterator.progress()),
        });
        await tick();
      }
    } while (geomIterator.next());

    serializer.finalize();
    if (format === 'obj') {
      return {
        primary: objBuf?.isReady() ? objBuf.getValue() : '',
        secondary: mtl?.isReady() ? mtl.getValue() : '',
      };
    }
    if (!shell.fs) throw new IfcOpenShellError(`Cannot read ${format} output without Emscripten FS`);
    const bytes = shell.fs.readFile(outputPath!, { encoding: 'utf8' });
    return { primary: typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes), secondary: '' };
  } finally {
    release(geomIterator);
    release(serializer);
    release(objBuf);
    release(mtl);
    if (outputPath && shell.fs) {
      try {
        shell.fs.unlink(outputPath);
      } catch {
        // ignore cleanup failure
      }
    }
  }
}

function writeElement(
  geomIterator: IfcOpenshellGeomIterator,
  serializer: IfcOpenshellGeomGeometrySerializer,
  preferTriangulation: boolean,
): void {
  const failures: unknown[] = [];
  const tri = () => {
    let item: IfcOpenshellGeomTriangulationElement | null = null;
    try {
      item = geomIterator.getAsTriangulationElement();
      if (!item || item.ptr === 0) {
        failures.push(new IfcOpenShellError('Geometry iterator did not provide a triangulation element'));
        return false;
      }
      serializer.writeTriangulationElement(item);
      return true;
    } catch (error) {
      failures.push(error);
      return false;
    } finally {
      release(item);
    }
  };
  const brep = () => {
    let item: IfcOpenshellGeomBrepElement | null = null;
    try {
      item = geomIterator.getAsBrepElement();
      if (!item || item.ptr === 0) {
        failures.push(new IfcOpenShellError('Geometry iterator did not provide a BRep element'));
        return false;
      }
      serializer.writeBrepElement(item);
      return true;
    } catch (error) {
      failures.push(error);
      return false;
    } finally {
      release(item);
    }
  };
  const written = preferTriangulation ? tri() || brep() : brep() || tri();
  if (!written) {
    const cause = failures.length === 1
      ? failures[0]
      : new AggregateError(failures, 'Neither geometry representation could be serialized');
    throw new IfcOpenShellError('Failed to serialize a geometry element as triangulation or BRep', cause);
  }
}

function uniquePath(format: SerializerFormat): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `/ifcopenshell-js-${format}-${stamp}.${format}`;
}

function progressRatio(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  if (progress > 1) return Math.max(0, Math.min(1, progress / 100));
  return Math.max(0, Math.min(1, progress));
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function release(handle: { destroy(): void } | null | undefined): void {
  try {
    handle?.destroy();
  } catch {
    // ignore double destroy
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError('IfcOpenShell operation was cancelled', signal.reason);
}
