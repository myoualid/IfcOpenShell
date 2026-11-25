// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// The base class of generated lark.Transformer subclasses. It transforms the trees of any Lark.js
// parser, as the Transformer of each generated parser only knows the trees of that parser.

import { camel } from './lang.js';

/** A Lark.js tree: the name of its rule and its children (trees, tokens or transformed values). */
export interface LarkTree {
  data: string;
  children: unknown[];
}

function isTree(value: unknown): value is LarkTree {
  return typeof value === 'object' && value !== null && 'data' in value && Array.isArray((value as LarkTree).children);
}

function isToken(value: unknown): value is { type: string; value: string } {
  return typeof value === 'object' && value !== null && 'type' in value && 'value' in value && typeof value.value === 'string';
}

/**
 * Transforms a tree from the leaves up. The method with the camelCase name of a rule gets the
 * transformed children of each tree of that rule; the method with the name of a terminal gets the
 * text of each token of that terminal. A token with no method becomes its text, and a tree with no
 * method stays a tree of its transformed children.
 */
export class Transformer {
  /** The transformed tree; the caller's type, as the methods of the subclass decide what it is. */
  transform<T = unknown>(tree: LarkTree): T {
    const children = tree.children.map(child => (isTree(child) ? this.transform<unknown>(child) : isToken(child) ? this.token(child) : child));
    const method = (this as Record<string, unknown>)[camel(tree.data)];
    return (typeof method === 'function' ? method.call(this, children) : { data: tree.data, children }) as T;
  }

  private token(token: { type: string; value: string }): unknown {
    const method = (this as Record<string, unknown>)[camel(token.type)];
    return typeof method === 'function' ? method.call(this, token.value) : token.value;
  }
}
