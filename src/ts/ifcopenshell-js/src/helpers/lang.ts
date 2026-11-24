// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// Typed helpers for generated code: calling conventions (options objects), regular expressions,
// sets and maps keyed by entity identity, and entity equality. Generated code chooses each operation
// from the types it knows; these helpers do not dispatch on the type of their arguments.
// Hand-written, unlike the transpiled util/ and api/ next to it.

/** Options object for `f(a, *values)`: values fill the optional parameters `names` in order. */
export function positionalOptions(names: string[], values: Iterable<unknown>): Record<string, unknown> {
  const items = Array.from(values);
  if (items.length > names.length) throw new TypeError(`takes at most ${names.length} optional arguments (${items.length} given)`);
  return Object.fromEntries(items.map((value, i) => [names[i], value]));
}

/** Python snake_case name as the camelCase option key generated functions take; CONSTANT_CASE and leading underscores are kept. */
export function camel(name: string): string {
  const stripped = name.replace(/^_+/, '');
  if (!stripped || stripped.toUpperCase() === stripped) return name;
  const [head, ...rest] = stripped.split('_');
  return name.slice(0, name.length - stripped.length) + head + rest.map(part => part.slice(0, 1).toUpperCase() + part.slice(1)).join('');
}

/** Options object for `f(**values)`: Python keyword names become camelCase keys; `consumed` were passed positionally. */
export function kwargs(values: unknown, consumed: string[] = []): Record<string, unknown> {
  const entries = values instanceof Map ? Array.from(values.entries()) : Object.entries(values as Record<string, unknown>);
  return Object.fromEntries(entries.filter(([key]) => !consumed.includes(key as string)).map(([key, value]) => [camel(key as string), value]));
}

export function range(start: number, stop: number, step = 1): number[] {
  if (step === 0) throw new Error('ValueError: range() arg 3 must not be zero');
  const result: number[] = [];
  for (let i = start; step > 0 ? i < stop : i > stop; i += step) result.push(i);
  return result;
}

/** Python `str.isdigit()` and the other character class tests: false for empty strings. */

function regexp(pattern: string | RegExp, flags = 0, extra = ''): RegExp {
  if (pattern instanceof RegExp) return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '') + extra);
  const source = pattern.replace(/\(\?P</g, '(?<').replace(/\(\?P=(\w+)\)/g, '\\k<$1>');
  return new RegExp(source, (flags & 2 ? 'i' : '') + (flags & 8 ? 'm' : '') + (flags & 16 ? 's' : '') + extra);
}

/** Python `re.Match`. */
export class Match {
  constructor(private readonly result: RegExpExecArray) {}
  group(index: number | string = 0): string | null {
    const value = typeof index === 'number' ? this.result[index] : this.result.groups?.[index];
    return value ?? null;
  }
  groups(): (string | null)[] {
    return this.result.slice(1).map(value => value ?? null);
  }
  start(): number {
    return this.result.index;
  }
  end(): number {
    return this.result.index + this.result[0].length;
  }
}

/** Python `re` functions used by ifcopenshell. Flags use Python's values (re.I is 2). */
export const re = {
  I: 2, IGNORECASE: 2, M: 8, MULTILINE: 8, S: 16, DOTALL: 16,
  match(pattern: string | RegExp, text: string, flags = 0): Match | null {
    const result = regexp(pattern, flags, 'y').exec(text);
    return result ? new Match(result) : null;
  },
  fullmatch(pattern: string | RegExp, text: string, flags = 0): Match | null {
    const source = pattern instanceof RegExp ? pattern.source : pattern;
    const result = regexp(`(?:${source})$`, flags, 'y').exec(text);
    return result ? new Match(result) : null;
  },
  search(pattern: string | RegExp, text: string, flags = 0): Match | null {
    const result = regexp(pattern, flags).exec(text);
    return result ? new Match(result) : null;
  },
  findall(pattern: string | RegExp, text: string, flags = 0): (string | string[])[] {
    return [...text.matchAll(regexp(pattern, flags, 'g'))].map(m => (m.length > 2 ? m.slice(1) : m[m.length > 1 ? 1 : 0]!) as string | string[]);
  },
  sub(pattern: string | RegExp, replacement: string | ((match: Match) => string), text: string, count = 0, flags = 0): string {
    let remaining = count || Infinity;
    return text.replace(regexp(pattern, flags, 'g'), (...args) => {
      const whole = args[0] as string;
      if (remaining-- <= 0) return whole;
      if (typeof replacement === 'function') {
        const offset = args.findIndex(a => typeof a === 'number');
        const result = Object.assign([...args.slice(0, offset)], { index: args[offset], input: text }) as unknown as RegExpExecArray;
        return replacement(new Match(result));
      }
      return replacement.replace(/\\(\d+)|\\g<(\w+)>/g, (_, n, name) => (name ? (args.at(-1) as Record<string, string>)?.[name] : args[Number(n)]) ?? '');
    });
  },
  split(pattern: string | RegExp, text: string, flags = 0): string[] {
    return text.split(regexp(pattern, flags));
  },
  compile(pattern: string, flags = 0) {
    const self = re;
    return {
      pattern,
      match: (text: string) => self.match(pattern, text, flags),
      fullmatch: (text: string) => self.fullmatch(pattern, text, flags),
      search: (text: string) => self.search(pattern, text, flags),
      findall: (text: string) => self.findall(pattern, text, flags),
      sub: (replacement: string | ((match: Match) => string), text: string, count = 0) => self.sub(pattern, replacement, text, count, flags),
      split: (text: string) => self.split(pattern, text, flags),
    };
  },
  escape(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },
};

/** Python `pathlib.Path` for locating files next to a module; paths are file URLs or plain paths. */

export function zip(...iterables: Iterable<any>[]): any[][] {
  const arrays = iterables.map(values => Array.from(values));
  const length = arrays.length ? Math.min(...arrays.map(values => values.length)) : 0;
  return Array.from({ length }, (_, i) => arrays.map(values => values[i]));
}

/** Python `iter(values)`. */

/** Identity of a key, as Python hashing sees it: tuples by value, entities by identity. */
function isEntity(value: unknown): value is { identity(): number; filePointer(): number } {
  return value !== null && typeof value === 'object'
    && typeof (value as { identity?: unknown }).identity === 'function'
    && typeof (value as { filePointer?: unknown }).filePointer === 'function';
}

/**
 * The key of a set member or dict key: an entity by its identity(), so that two handles of one
 * entity are equal, as in Python; a list by its items; other values as they are.
 */
function keyOf(key: unknown): unknown {
  if (isEntity(key)) return `@${key.filePointer()}:${key.identity()}`;
  if (Array.isArray(key)) return JSON.stringify(key.map(item => {
    const k = keyOf(item);
    return typeof k === 'object' && k !== null ? String(k) : k;
  }));
  return key;
}

function items<T>(values: Iterable<T> | ReadonlySetLike<T>): Iterable<T> {
  return Symbol.iterator in Object(values) ? values as Iterable<T> : { [Symbol.iterator]: () => (values as ReadonlySetLike<T>).keys() };
}

/** Python set: members compare by value, and entities by identity(), as Python entity equality does. */
export class IdentitySet<T = any> extends Set<T> {
  private readonly members = new Map<unknown, T>();

  constructor(values?: Iterable<T> | null) {
    super();
    for (const value of values ?? []) this.add(value);
  }

  override add(value: T): this {
    const key = keyOf(value);
    if (!this.members.has(key)) {
      this.members.set(key, value);
      super.add(value);
    }
    return this;
  }

  override has(value: T): boolean {
    return this.members.has(keyOf(value));
  }

  override delete(value: T): boolean {
    const key = keyOf(value);
    if (!this.members.has(key)) return false;
    const member = this.members.get(key) as T;
    this.members.delete(key);
    return super.delete(member);
  }

  override clear(): void {
    this.members.clear();
    super.clear();
  }

  override union<U>(other: Iterable<U> | ReadonlySetLike<U>): IdentitySet<T | U> {
    return new IdentitySet<T | U>([...this, ...items(other)]);
  }

  override intersection<U>(other: Iterable<U> | ReadonlySetLike<U>): IdentitySet<T & U> {
    const others = new IdentitySet<unknown>(items(other));
    return new IdentitySet([...this].filter(value => others.has(value))) as IdentitySet<T & U>;
  }

  override difference<U>(other: Iterable<U> | ReadonlySetLike<U>): IdentitySet<T> {
    const others = new IdentitySet<unknown>(items(other));
    return new IdentitySet([...this].filter(value => !others.has(value)));
  }

  override symmetricDifference<U>(other: Iterable<U> | ReadonlySetLike<U>): IdentitySet<T | U> {
    const others = new IdentitySet<T | U>(items(other));
    return new IdentitySet<T | U>([...[...this].filter(v => !others.has(v)), ...[...others].filter(v => !this.has(v as T))]);
  }

  override isSubsetOf(other: Iterable<unknown> | ReadonlySetLike<unknown>): boolean {
    const others = new IdentitySet<unknown>(items(other));
    return [...this].every(value => others.has(value));
  }

  override isSupersetOf(other: Iterable<unknown> | ReadonlySetLike<unknown>): boolean {
    return [...items(other)].every(value => this.has(value as T));
  }

  override isDisjointFrom(other: Iterable<unknown> | ReadonlySetLike<unknown>): boolean {
    return [...items(other)].every(value => !this.has(value as T));
  }
}

/**
 * Python `dict` (or `defaultdict`) with keys other than strings: tuples compare by value,
 * entities by identity, and numbers stay numbers.
 */
export class Dict<K = any, V = any> extends Map<K, V> {
  private readonly keys_ = new Map<unknown, K>();

  constructor(entries?: Iterable<readonly [K, V]> | null, private readonly factory?: () => V) {
    super();
    for (const [key, value] of entries ?? []) this.set(key, value);
  }

  override get(key: K): V | undefined {
    const canonical = this.keys_.get(keyOf(key));
    if (canonical === undefined && this.factory) {
      const value = this.factory();
      this.set(key, value);
      return value;
    }
    return canonical === undefined ? undefined : super.get(canonical);
  }

  override set(key: K, value: V): this {
    const id = keyOf(key);
    const canonical = this.keys_.get(id) ?? key;
    this.keys_.set(id, canonical);
    return super.set(canonical, value);
  }

  override has(key: K): boolean {
    return this.keys_.has(keyOf(key));
  }

  override delete(key: K): boolean {
    const id = keyOf(key);
    const canonical = this.keys_.get(id);
    if (canonical === undefined) return false;
    this.keys_.delete(id);
    return super.delete(canonical);
  }

  /** Python `d.get(key, default)`, without creating defaultdict entries. */
  lookup(key: K, otherwise: V | null = null): V | null {
    const canonical = this.keys_.get(keyOf(key));
    return canonical === undefined ? otherwise : super.get(canonical)!;
  }

  override clear(): void {
    this.keys_.clear();
    super.clear();
  }

  setdefault(key: K, value: V): V {
    if (!this.has(key)) this.set(key, value);
    return this.lookup(key) as V;
  }

  pop(key: K, ...otherwise: [V?]): V {
    if (!this.has(key)) {
      if (otherwise.length) return otherwise[0] as V;
      throw new Error('KeyError');
    }
    const value = this.lookup(key) as V;
    this.delete(key);
    return value;
  }
}

/** Python `d.get(key, default)` on a Map or Dict, without creating defaultdict entries. */
export function dictGet(dict: Map<any, any>, key: unknown, otherwise: any = null): any {
  return dict instanceof Dict ? dict.lookup(key, otherwise) : dict.has(key) ? dict.get(key)! : otherwise;
}

/** Python `d.setdefault(key, value)` on a Map or Dict. */
export function dictSetdefault<K, V>(dict: Map<K, V>, key: K, value: V): V {
  if (!dict.has(key)) dict.set(key, value);
  return dictGet(dict, key) as V;
}

/** A Python set (see {@link IdentitySet}), typed as a plain Set. */
export function identitySet<T = any>(values?: Iterable<T> | null): Set<T> {
  return new IdentitySet<T>(values);
}

interface DeclaredTypeCasts {
  asNamedType?(): { declaredType(): unknown } | null;
  asSimpleType?(): { declaredType(): unknown } | null;
  asTypeDeclaration?(): { declaredType(): unknown } | null;
}

/** declared_type() of a named, simple or type declaration, with the explicit cast that it needs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a schema declaration, used as Python does
export function declaredType(declaration: DeclaredTypeCasts): any {
  const cast = declaration.asNamedType?.() ?? declaration.asSimpleType?.() ?? declaration.asTypeDeclaration?.();
  if (!cast) throw new TypeError('declared_type() needs a named, simple or type declaration');
  return cast.declaredType();
}

/** Python `a == b` for entities: two handles of one entity are equal. Other values compare with ===. */

/** Python `a == b` with an entity: two handles of one entity are equal. */
export function sameEntity(a: { identity(): number; filePointer(): number } | null | undefined, b: unknown): boolean {
  if (a === b) return true;
  return a != null && isEntity(b) && a.identity() === b.identity() && a.filePointer() === b.filePointer();
}

/** A typing.NamedTuple or collections.namedtuple value: an array whose items are also named fields. */
export function namedTuple(fields: string[], values: any[]): any {
  return Object.assign(values, Object.fromEntries(fields.map((field, i) => [field, values[i]])));
}

/** entity_instance.walk: `g(value)` where `f(value)` holds, applied to each item of lists and tuples. */
export function walk(f: (value: unknown) => boolean, g: (value: unknown) => unknown, value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => walk(f, g, item));
  return f(value) ? g(value) : value;
}
