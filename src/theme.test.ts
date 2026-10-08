import { describe, expect, it } from "vitest";
import { parseTheme, THEME_VARS } from "./theme";

describe("parseTheme", () => {
  it("keeps every known setting, including ones that aren't CSS variables", () => {
    const json = JSON.stringify({ bg: "#000000", surfaces: "none", tabs: "card", contrast: "auto",
      bannerEdgePos: 180, edgeSmooth: 12, edgeDither: 7, unknown: "x" });
    const t = parseTheme(json);
    expect(t).toMatchObject({ bg: "#000000", surfaces: "none", tabs: "card", contrast: "auto",
      bannerEdgePos: 180, edgeSmooth: 12, edgeDither: 7 });
    expect(t).not.toHaveProperty("unknown");
  });

  it("round-trips a full theme", () => {
    const full = Object.fromEntries(THEME_VARS.map((v, i) => [v.key, v.kind === "choice" ? v.options![0] : i]));
    expect(parseTheme(JSON.stringify(full))).toEqual(full);
  });
});
