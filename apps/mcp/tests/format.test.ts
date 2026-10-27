import { describe, it, expect } from "vitest";
import { fmt, niceTicks, plural, unnumbered } from "../src/kit/format";

describe("kit number formatting", () => {
  it("shows cents only for fractional amounts under 100", () => {
    expect(fmt(0, "currency")).toBe("$0");
    expect(fmt(7.5, "currency")).toBe("$7.50");
    expect(fmt(7612.26, "currency")).toBe("$7,612");
  });

  it("writes a money magnitude right after the amount", () => {
    expect(fmt(700, "currency", "bn")).toBe("$700bn");
    expect(fmt(700, "currency", "billion")).toBe("$700 billion");
  });

  it("reads non-finite values as n/a and appends units", () => {
    expect(fmt(NaN)).toBe("n/a");
    expect(fmt(700, "number", "$bn")).toBe("700 $bn");
    expect(fmt(66.83, "percent")).toBe("66.8%");
  });

  it("rounds axis ticks to 1, 2 or 5 times a power of ten", () => {
    expect(niceTicks(0, 7612, 5)).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it("pluralizes trial names", () => {
    expect(plural("game")).toBe("games");
    expect(plural("toss")).toBe("tosses");
    expect(plural("match")).toBe("matches");
  });

  it("drops stage numbers a caller added, since the kit numbers stages itself", () => {
    const labels = Array.from({ length: 10 }, (_, i) => `${i + 1} Step`);
    expect(unnumbered(labels)).toEqual(Array(10).fill("Step"));
    expect(unnumbered(["1. Draft", "2) Review", "3: Ship"])).toEqual(["Draft", "Review", "Ship"]);
  });

  it("keeps labels whose numbers are content rather than a sequence", () => {
    expect(unnumbered(["1 Draft", "Review"])).toEqual(["1 Draft", "Review"]);
    expect(unnumbered(["2 eggs", "3 cups of flour"])).toEqual(["2 eggs", "3 cups of flour"]);
    expect(unnumbered(["1 ", "2 Mix"])).toEqual(["1 ", "2 Mix"]);
  });
});
