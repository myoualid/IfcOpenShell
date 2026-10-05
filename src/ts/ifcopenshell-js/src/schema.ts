
import { IfcOpenShellError } from './init.js';

/** Map an IFC schema name onto the matching WASM schema plugin id. */
export function schemaPluginId(schemaName: string): string {
  const normalized = schemaName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (normalized.includes('ifc2x3')) return 'ifc2x3';
  if (normalized.includes('ifc4x3')) return 'ifc4x3_add2';
  if (normalized.includes('ifc4')) return 'ifc4';
  throw new IfcOpenShellError(
    `Unsupported schema "${schemaName}"; supported schemas are IFC2X3, IFC4, and IFC4X3`,
  );
}
