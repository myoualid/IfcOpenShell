// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// ifcopenshell.util.cost.CostValueUnserialiser, ported by hand: Python parses cost formulas such as
// "5000 * 1.19" or "SUM(2 + 3)" with a Lark grammar, which the transpiler does not translate.
// The grammar, and the dictionaries built from its parse tree, are those of util/cost.py:
//
//   formula: operand (operator operand)*
//   operand: value | category "(" formula ")"
//   value: NUMBER?
//   category: WORD?
//   operator: "+" | "/" | "*" | "-"

type Token = { kind: 'number' | 'word' | 'operator' | '(' | ')' | 'end'; text: string; at: number };

const OPERATORS: Record<string, string> = { '+': 'ADD', '/': 'DIVIDE', '*': 'MULTIPLY', '-': 'SUBTRACT' };
// Lark's common NUMBER: FLOAT (INT _EXP | DECIMAL _EXP?) or INT, unsigned.
const NUMBER = /^(?:(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+|\d+)/;

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < formula.length) {
    const rest = formula.slice(at);
    const space = /^[ \t\f\r\n]+/.exec(rest);
    if (space) {
      at += space[0].length;
      continue;
    }
    const number = NUMBER.exec(rest);
    const word = /^[A-Za-z]+/.exec(rest);
    if (number) tokens.push({ kind: 'number', text: number[0], at });
    else if (word) tokens.push({ kind: 'word', text: word[0], at });
    else if (rest[0]! in OPERATORS) tokens.push({ kind: 'operator', text: rest[0]!, at });
    else if (rest[0] === '(' || rest[0] === ')') tokens.push({ kind: rest[0], text: rest[0], at });
    else throw new Error(`UnexpectedCharacters: No terminal matches '${rest[0]}' in the current parser context, at col ${at + 1}`);
    at += tokens[tokens.length - 1]!.text.length;
  }
  tokens.push({ kind: 'end', text: '', at });
  return tokens;
}

/** Python `CostValueUnserialiser().parse(formula)`: the cost value data the formula describes. */
export class CostValueUnserialiser {
  private tokens: Token[] = [];
  private position = 0;

  parse(formula: string): Record<string, any> {
    this.tokens = tokenize(formula);
    this.position = 0;
    const result = this.formula();
    const next = this.peek();
    if (next.kind !== 'end') throw new Error(`UnexpectedToken: '${next.text}' at col ${next.at + 1}`);
    return result;
  }

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private take(kind: Token['kind']): Token {
    const token = this.peek();
    if (token.kind !== kind) throw new Error(`UnexpectedToken: expected ${kind}, got '${token.text || 'end of input'}' at col ${token.at + 1}`);
    this.position++;
    return token;
  }

  /** get_formula: one operand as itself, else its components and the (last) operator. */
  private formula(): Record<string, any> {
    const operands = [this.operand()];
    let operator: string | undefined;
    while (this.peek().kind === 'operator') {
      operator = OPERATORS[this.take('operator').text];
      operands.push(this.operand());
    }
    if (operands.length === 1) return operands[0]!;
    return { Components: operands, ArithmeticOperator: operator };
  }

  /** get_operand: a value, or a category (possibly empty, for plain parentheses) of a formula. */
  private operand(): Record<string, any> {
    const token = this.peek();
    const next = this.tokens[this.position + 1]!;
    if (token.kind === '(' || (token.kind === 'word' && next.kind === '(')) {
      let category: string | null = token.kind === 'word' ? this.take('word').text : null;
      this.take('(');
      const formula = this.formula();
      this.take(')');
      const data: Record<string, any> = {};
      if (category) {
        if (category.toLowerCase() === 'sum') category = '*';
        data.Category = category;
      }
      if (formula.Components?.length) {
        data.Components = formula.Components;
        data.ArithmeticOperator = formula.ArithmeticOperator;
      } else {
        data.AppliedValue = formula.AppliedValue;
      }
      return data;
    }
    const value = token.kind === 'number' ? this.take('number').text : null;
    return { AppliedValue: value ? Number(value) : null };
  }
}
