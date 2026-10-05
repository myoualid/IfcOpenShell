import type { Entity } from '../entity.js';
import type { IfcFile } from '../file.js';
import type { SidecarElementMetadata } from './sidecar/types.js';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function entityMetadata(entity: Entity): SidecarElementMetadata {
  return {
    id: entity.id(),
    type: entity.isA(),
    name: asString(entity.get('Name')),
    guid: asString(entity.get('GlobalId')),
  };
}

/** Build express-id metadata for all IFC products in an opened file. */
export function buildElementMetadataMap(file: IfcFile): Map<number, SidecarElementMetadata> {
  const map = new Map<number, SidecarElementMetadata>();
  for (const entity of file.byType('IfcProduct')) {
    map.set(entity.id(), entityMetadata(entity));
  }
  return map;
}
