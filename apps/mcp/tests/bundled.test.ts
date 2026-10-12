import { describe, it, expect } from "vitest";
import { listSkills, loadSkill, useBundledSkills } from "../src/skills";
import { kitViewHtml, useBundledKit } from "../src/renderer";

describe("bundled assets for hosts without a filesystem", () => {
  it("serves bundled skill texts and still rejects names outside the set", () => {
    useBundledSkills({ beta: "B", alpha: "A" });
    try {
      expect(listSkills()).toEqual(["alpha", "beta"]);
      expect(loadSkill("alpha")).toBe("A");
      for (const name of ["../alpha", "constructor", "gamma"]) {
        expect(() => loadSkill(name), name).toThrow("Invalid skill name");
      }
    } finally {
      useBundledSkills(undefined);
    }
  });

  it("inlines an injected kit bundle with closing script tags escaped", () => {
    useBundledKit('window.OGUIKit={};var s="</script>";');
    expect(kitViewHtml("parts")).toContain('window.OGUIKit={};var s="<\\/script>";');
  });
});
