import { describe, expect, it } from "vitest";
import { findMatch, matchesItem, normalize } from "./match";
import type { Item } from "./format";

const item = (canonical: string, ...aliases: string[]): Item => ({ canonical, aliases, data: [] });

describe("normalize", () => {
  it("is case- and diacritic-insensitive", () => {
    expect(normalize("Côte d'Ivoire")).toBe("cotedivoire");
    expect(normalize("  SÃO   Tomé ")).toBe("saotome");
  });
  it("ignores spaces, hyphens and punctuation", () => {
    expect(normalize("Guinea-Bissau")).toBe("guineabissau");
    expect(normalize("St. Kitts & Nevis")).toBe("stkittsnevis");
    expect(normalize("Hawai‘i")).toBe("hawaii");
  });
  it("folds math letters and subscripts", () => {
    expect(normalize("add(𝒩)")).toBe(normalize("add N"));
    expect(normalize("cov(ℳ)")).toBe("covm");
    expect(normalize("𝔟")).toBe("b");
    expect(normalize("ℵ₁")).toBe(normalize("ℵ1"));
  });
  it("spells out Greek letters and daggers", () => {
    expect(normalize("κ → (ω₁)^{<ω}_{2}")).toBe(normalize("kappa -> (omega_1)^<omega_2"));
    expect(normalize("α-Mahlo")).toBe("alphamahlo");
    expect(normalize("ς")).toBe("sigma");
    expect(normalize("0^{†} exists")).toBe("0daggerexists");
    expect(normalize("0^{#} exists")).toBe("0sharpexists");
  });
  it("keeps sharps and flats", () => {
    expect(normalize("F♯")).toBe("fsharp");
    expect(normalize("F#")).toBe("fsharp");
    expect(normalize("F sharp")).toBe("fsharp");
    expect(normalize("B♭ minor")).toBe(normalize("B flat minor"));
    expect(normalize("F#")).not.toBe(normalize("F"));
  });
});

describe("matchesItem", () => {
  it("matches canonical and aliases loosely", () => {
    const ci = item("Côte d'Ivoire", "Ivory Coast");
    expect(matchesItem("ivory coast", ci)).toBe(true);
    expect(matchesItem("cote d ivoire", ci)).toBe(true);
    expect(matchesItem("COTE D'IVOIRE", ci)).toBe(true);
    expect(matchesItem("Ivory", ci)).toBe(false);
  });
  it("does not match the empty string", () => {
    expect(matchesItem("   ", item("x"))).toBe(false);
  });
});

describe("findMatch", () => {
  it("returns the index of the first match, or -1", () => {
    const items = [item("Niger"), item("Nigeria")];
    expect(findMatch("nigeria", items)).toBe(1);
    expect(findMatch("niger", items)).toBe(0);
    expect(findMatch("nige", items)).toBe(-1);
  });
});
