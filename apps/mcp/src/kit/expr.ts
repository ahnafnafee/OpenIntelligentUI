// Safe formula language for kit specs: numbers, variables, + - * / % ^,
// comparisons, && || !, ternaries, and a fixed set of math functions.
// Formulas compile to closures; nothing is ever passed to eval or Function.

export class ExprError extends Error {}

export type Scope = Record<string, number>;
export type Compiled = (scope: Scope) => number;
export interface CompileOptions {
  rng?: () => number;
}

const MAX_LENGTH = 400;
const MAX_DEPTH = 48;
const RESERVED = new Set(["constructor", "prototype", "__proto__", "this", "toString", "valueOf", "hasOwnProperty"]);
const CONSTANTS: Record<string, number> = { PI: Math.PI, E: Math.E };

type Fn = (args: number[], rng: () => number) => number;
const FUNCTIONS: Record<string, Fn> = {
  abs: (a) => Math.abs(a[0]),
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  pow: (a) => Math.pow(a[0], a[1]),
  sqrt: (a) => Math.sqrt(a[0]),
  exp: (a) => Math.exp(a[0]),
  log: (a) => Math.log(a[0]),
  log10: (a) => Math.log10(a[0]),
  round: (a) => Math.round(a[0]),
  floor: (a) => Math.floor(a[0]),
  ceil: (a) => Math.ceil(a[0]),
  sin: (a) => Math.sin(a[0]),
  cos: (a) => Math.cos(a[0]),
  tan: (a) => Math.tan(a[0]),
  clamp: (a) => Math.min(Math.max(a[0], a[1]), a[2]),
  rand: (_a, rng) => rng(),
  randint: (a, rng) => a[0] + Math.floor(rng() * (a[1] - a[0] + 1)),
};

type Token = { kind: "num"; value: number } | { kind: "id"; value: string } | { kind: "op"; value: string };

const OPERATORS = ["==", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "%", "^", "(", ")", ",", "<", ">", "!", "?", ":"];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { tokens.push({ kind: "num", value: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { tokens.push({ kind: "id", value: id[0] }); i += id[0].length; continue; }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) { tokens.push({ kind: "op", value: op }); i += op.length; continue; }
    throw new ExprError(`Unexpected "${ch}" in formula`);
  }
  return tokens;
}

const truth = (v: number) => (v !== 0 && !Number.isNaN(v) ? 1 : 0);

export function compile(src: string, options: CompileOptions = {}): Compiled {
  if (src.length > MAX_LENGTH) throw new ExprError(`Formula is too long (max ${MAX_LENGTH} characters)`);
  const rng = options.rng ?? Math.random;
  const tokens = tokenize(src);
  let pos = 0;
  let depth = 0;

  const peek = (v?: string) => {
    const t = tokens[pos];
    return t && t.kind === "op" && (v === undefined || t.value === v) ? t : undefined;
  };
  const expect = (v: string) => {
    if (!peek(v)) throw new ExprError(`Expected "${v}" in formula`);
    pos++;
  };
  const deeper = <T>(fn: () => T): T => {
    if (++depth > MAX_DEPTH) throw new ExprError("Formula is nested too deeply");
    try { return fn(); } finally { depth--; }
  };

  const ternary = (): Compiled => deeper(() => {
    const cond = or();
    if (!peek("?")) return cond;
    pos++;
    const yes = ternary();
    expect(":");
    const no = ternary();
    return (s) => (truth(cond(s)) ? yes(s) : no(s));
  });
  const or = (): Compiled => {
    let left = and();
    while (peek("||")) { pos++; const l = left, r = and(); left = (s) => (truth(l(s)) || truth(r(s)) ? 1 : 0); }
    return left;
  };
  const and = (): Compiled => {
    let left = cmp();
    while (peek("&&")) { pos++; const l = left, r = cmp(); left = (s) => (truth(l(s)) && truth(r(s)) ? 1 : 0); }
    return left;
  };
  const cmp = (): Compiled => {
    const left = add();
    const op = ["==", "!=", "<=", ">=", "<", ">"].find((o) => peek(o));
    if (!op) return left;
    pos++;
    const right = add();
    const test: Record<string, (a: number, b: number) => boolean> = {
      "==": (a, b) => a === b, "!=": (a, b) => a !== b, "<=": (a, b) => a <= b,
      ">=": (a, b) => a >= b, "<": (a, b) => a < b, ">": (a, b) => a > b,
    };
    return (s) => (test[op](left(s), right(s)) ? 1 : 0);
  };
  const add = (): Compiled => {
    let left = mul();
    for (let op = peek("+") ?? peek("-"); op; op = peek("+") ?? peek("-")) {
      pos++;
      const l = left, r = mul();
      left = op.value === "+" ? (s) => l(s) + r(s) : (s) => l(s) - r(s);
    }
    return left;
  };
  const mul = (): Compiled => {
    let left = unary();
    for (let op = peek("*") ?? peek("/") ?? peek("%"); op; op = peek("*") ?? peek("/") ?? peek("%")) {
      pos++;
      const l = left, r = unary(), v = op.value;
      left = v === "*" ? (s) => l(s) * r(s) : v === "/" ? (s) => l(s) / r(s) : (s) => l(s) % r(s);
    }
    return left;
  };
  const unary = (): Compiled => deeper(() => {
    if (peek("-")) { pos++; const v = unary(); return (s) => -v(s); }
    if (peek("+")) { pos++; return unary(); }
    if (peek("!")) { pos++; const v = unary(); return (s) => (truth(v(s)) ? 0 : 1); }
    return power();
  });
  const power = (): Compiled => {
    const base = primary();
    if (!peek("^")) return base;
    pos++;
    const exponent = unary();
    return (s) => Math.pow(base(s), exponent(s));
  };
  const primary = (): Compiled => {
    const t = tokens[pos];
    if (!t) throw new ExprError("Formula ends too early");
    if (t.kind === "num") { pos++; const v = t.value; return () => v; }
    if (t.kind === "op" && t.value === "(") {
      pos++;
      const inner = ternary();
      expect(")");
      return inner;
    }
    if (t.kind === "id") {
      pos++;
      const name = t.value;
      if (RESERVED.has(name)) throw new ExprError(`"${name}" is not allowed in formulas`);
      if (peek("(")) {
        const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, name) ? FUNCTIONS[name] : undefined;
        if (!fn) throw new ExprError(`Unknown function "${name}"`);
        pos++;
        const args: Compiled[] = [];
        if (!peek(")")) {
          args.push(ternary());
          while (peek(",")) { pos++; args.push(ternary()); }
        }
        expect(")");
        return (s) => fn(args.map((a) => a(s)), rng);
      }
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) { const v = CONSTANTS[name]; return () => v; }
      return (s) => {
        if (!Object.prototype.hasOwnProperty.call(s, name)) throw new ExprError(`Unknown variable "${name}"`);
        return s[name];
      };
    }
    throw new ExprError(`Unexpected "${t.value}" in formula`);
  };

  const root = ternary();
  if (pos < tokens.length) {
    const t = tokens[pos];
    throw new ExprError(`Unexpected "${t.kind === "num" ? t.value : t.value}" in formula`);
  }
  return (scope) => {
    for (const key of Object.keys(scope)) {
      if (RESERVED.has(key)) throw new ExprError(`"${key}" is not allowed in formulas`);
    }
    return root(scope);
  };
}

export function variables(src: string): string[] {
  const tokens = tokenize(src);
  const seen: string[] = [];
  tokens.forEach((t, i) => {
    if (t.kind !== "id") return;
    const next = tokens[i + 1];
    const isCall = next && next.kind === "op" && next.value === "(";
    if (isCall || Object.prototype.hasOwnProperty.call(CONSTANTS, t.value) || seen.includes(t.value)) return;
    seen.push(t.value);
  });
  return seen;
}
