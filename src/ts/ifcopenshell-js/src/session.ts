
import { IfcFile, type OpenOptions } from './file.js';
import {
  IfcOpenShellError,
  init as initRuntime,
  type IfcOpenShell,
} from './init.js';
import { schemaPluginId } from './schema.js';
import type { InitOptions } from './types.js';

let session: IfcOpenShell | null = null;

/**
 * Initialize the WASM runtime once per process and remember it for
 * {@link open} / {@link file}.
 */
export async function init(options: InitOptions = {}): Promise<IfcOpenShell> {
  session = await initRuntime(options);
  return session;
}

/** Return the runtime from {@link init}, or throw if not initialized. */
export function requireSession(): IfcOpenShell {
  if (session == null) {
    throw new IfcOpenShellError('Call init() before open() or file()');
  }
  return session;
}

async function loadSchemaPlugin(shell: IfcOpenShell, schemaName: string): Promise<void> {
  const id = schemaPluginId(schemaName);
  const key = `schema:${id}`;
  if (shell.loadedPlugins().includes(key)) return;
  await shell.loadPlugin('schema', id);
}

function peekStepSchema(bytes: Uint8Array): string | null {
  const head = bytes.subarray(0, Math.min(bytes.byteLength, 8192));
  const text = new TextDecoder().decode(head);
  const match = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  return match?.[1] ?? null;
}

/** Open IFC bytes using the runtime from {@link init}. */
export async function open(
  bytes: Uint8Array | ArrayBuffer,
  filename?: string,
  options: OpenOptions & { shell?: IfcOpenShell } = {},
): Promise<IfcFile> {
  const shell = options.shell ?? requireSession();
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const schema = peekStepSchema(view);
  if (schema) await loadSchemaPlugin(shell, schema);
  return IfcFile.open(shell, view, filename, options);
}

/** Create an empty in-memory file, matching Python `ifcopenshell.file(schema=...)`. */
export async function file(options: { schema?: string; shell?: IfcOpenShell } = {}): Promise<IfcFile> {
  const schema = options.schema ?? 'IFC4';
  const shell = options.shell ?? requireSession();
  await loadSchemaPlugin(shell, schema);
  return IfcFile.create(shell, schema);
}

export type { IfcOpenShell } from './init.js';
export {
  IfcOpenShellError,
  IfcOpenShellErrorCode,
  IfcOpenShellErrorKind,
  abortError,
  isIfcOpenShellAbortError,
} from './init.js';
