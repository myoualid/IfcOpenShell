// This file was generated with the assistance of an AI coding tool.

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readResource, registerResource } from '../src/file.js';

describe('resources', () => {
  it('returns registered bytes by file name or end of path', () => {
    registerResource('templates/Example.ifc', new TextEncoder().encode('ISO-10303-21;'));
    expect(new TextDecoder().decode(readResource('C:\\data\\templates\\Example.ifc'))).toBe('ISO-10303-21;');
    expect(new TextDecoder().decode(readResource('https://example.org/templates/Example.ifc'))).toBe('ISO-10303-21;');
  });

  it('reads from the file system when nothing is registered', () => {
    const url = new URL('./guid.test.ts', import.meta.url);
    expect(new TextDecoder().decode(readResource(url.href))).toContain('guid');
    expect(new TextDecoder().decode(readResource(fileURLToPath(url)))).toContain('guid');
  });
});
