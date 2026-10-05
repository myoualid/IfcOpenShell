
import { AttributeValue } from '../attribute.js';
import type { IfcFile } from '../file.js';

/** A single named attribute snapshot produced by {@link inspectEntity}. */
export interface AttributeEntry {
  name: string;
  value: string;
}

/** A plain-object snapshot of an entity's metadata (viewer helper, not Python `get_info`). */
export interface InspectEntityInfo {
  id: number;
  type: string;
  guid: string | null;
  attributes: AttributeEntry[];
}

/** @deprecated Use {@link InspectEntityInfo}. */
export type EntityInfo = InspectEntityInfo;

/** Format one attribute as a compact human-readable string. */
export async function formatAttributeValue(attr: AttributeValue): Promise<string> {
  try {
    if (attr.isNull) return '∅';
    const normalizedType = attr.type.replace(/\s+/g, '_');
    if (normalizedType === 'DERIVED') return '*';
    if (normalizedType === 'INSTANCE' || normalizedType === 'ENTITY_INSTANCE') {
      const inst = await attr.entity();
      try {
        return inst ? `#${inst.id()} · ${inst.isA()}` : '$';
      } finally {
        await inst?.dispose();
      }
    }
    if (normalizedType === 'ENUM' || normalizedType === 'ENUMERATION') return await attr.string();
    if (normalizedType.startsWith('AGGREGATE') || normalizedType.includes('LIST')) {
      try {
        return `[…${await attr.size()}]`;
      } catch {
        return '[…]';
      }
    }
    try { return await attr.string(); } catch { /* try next */ }
    try { return String(await attr.integer()); } catch { /* try next */ }
    try { return String(await attr.number()); } catch { /* try next */ }
    try { return String(await attr.boolean()); } catch { /* try next */ }
    return attr.type;
  } catch {
    return '?';
  }
}

/** Inspect an entity and return its id, type, GlobalId, and formatted attributes. */
export async function inspectEntity(file: IfcFile, id: number): Promise<InspectEntityInfo | null> {
  const entity = file.byId(id);
  if (!entity) return null;
  try {
    const names = entity.raw.getAttributeNames();
    const attributes = await Promise.all(names.map(async (name) => {
      using attr = entity.attribute(name);
      return { name, value: await formatAttributeValue(attr) };
    }));
    let guid: string | null = null;
    if (attributes.some((item) => item.name === 'GlobalId')) {
      try {
        const value = entity.GlobalId;
        guid = typeof value === 'string' ? value : null;
      } catch {
        guid = null;
      }
    }
    return { id: entity.id(), type: entity.isA(), guid, attributes };
  } finally {
    entity.dispose();
  }
}
