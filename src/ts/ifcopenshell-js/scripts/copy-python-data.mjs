// This file was generated with the assistance of an AI coding tool.

// Data files the transpiled ifcopenshell.util opens next to itself (Pset templates, JSON tables), and the
// Lark.js parsers that generate.py writes as .js with .d.ts declarations.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'src', 'util');
if (existsSync(source)) {
  cpSync(source, join(root, 'dist', 'util'), { recursive: true, filter: path => !path.endsWith('.ts') || path.endsWith('.d.ts') });
}
// API usecases have Lark.js parsers too (api/cost/assign_cost_item_quantity), but no data files.
const api = join(root, 'src', 'api');
if (existsSync(api)) {
  const parser = /_grammar\d+\.(js|d\.ts)$/;
  cpSync(api, join(root, 'dist', 'api'), { recursive: true, filter: path => !/\.\w+$/.test(path) || parser.test(path) });
}
