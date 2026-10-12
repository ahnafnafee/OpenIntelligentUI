import { describe, it, expect } from "vitest";
import { compile, variables, ExprError } from "../src/kit/expr";

const run = (src: string, scope: Record<string, number> = {}) => compile(src)(scope);

describe("compile", () => {
  it("follows arithmetic precedence and parentheses", () => {
    expect(run("2 + 3 * 4")).toBe(14);
    expect(run("(2 + 3) * 4")).toBe(20);
    expect(run("10 % 4 + 7 / 2")).toBe(5.5);
  });

  it("treats ^ as right-associative power below unary minus", () => {
    expect(run("2^3^2")).toBe(512);
    expect(run("-2^2")).toBe(-4);
    expect(run("2^-1")).toBe(0.5);
  });

  it("reads variables from the scope", () => {
    expect(run("P * (1 + r/100)^t", { P: 1000, r: 10, t: 2 })).toBeCloseTo(1210, 6);
  });

  it("supports whitelisted functions and constants", () => {
    expect(run("min(3, 1, 2) + max(4, 9)")).toBe(10);
    expect(run("clamp(5, 0, 3)")).toBe(3);
    expect(run("round(sqrt(16) + 0.4)")).toBe(4);
    expect(run("floor(PI)")).toBe(3);
  });

  it("returns 1 or 0 for comparisons and logic, and supports ternaries", () => {
    expect(run("3 > 2")).toBe(1);
    expect(run("pick == car", { pick: 2, car: 2 })).toBe(1);
    expect(run("pick != car", { pick: 2, car: 2 })).toBe(0);
    expect(run("1 && 0")).toBe(0);
    expect(run("0 || 5")).toBe(1);
    expect(run("!0")).toBe(1);
    expect(run("x > 0 ? 10 : -10", { x: -1 })).toBe(-10);
  });

  it("draws integers in range from randint with an injected rng", () => {
    let i = 0;
    const seq = [0, 0.34, 0.67, 0.999];
    const f = compile("randint(1, 3)", { rng: () => seq[i++ % seq.length] });
    expect([f({}), f({}), f({}), f({})]).toEqual([1, 2, 3, 3]);
  });

  it("rejects unknown variables and functions with a named error", () => {
    expect(() => run("a + 1")).toThrow(ExprError);
    expect(() => run("a + 1")).toThrow(/a/);
    expect(() => compile("alert(1)")).toThrow(/alert/);
  });

  it("rejects anything outside the grammar", () => {
    for (const bad of ["a.b", "x = 1", "constructor", "this", "`1`", "1 +", "(1", "[1]", "'s'"]) {
      expect(() => run(bad, { a: 1, x: 1, constructor: 1, this: 1 }), bad).toThrow(ExprError);
    }
  });

  it("caps formula length", () => {
    expect(() => compile("1+".repeat(300) + "1")).toThrow(/long/);
  });
});

describe("variables", () => {
  it("lists the free variables once, without functions or constants", () => {
    expect(variables("P*(1+r)^t + min(a, b) + PI + a")).toEqual(["P", "r", "t", "a", "b"]);
  });
});
