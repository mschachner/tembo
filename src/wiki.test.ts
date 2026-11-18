import { describe, expect, it } from "vitest";
import { wikiUrl } from "./wiki";

describe("wikiUrl", () => {
  it("builds an article URL from a title", () => {
    expect(wikiUrl("Clio")).toBe("https://en.wikipedia.org/wiki/Clio");
    expect(wikiUrl("Thalia (Muse)")).toBe("https://en.wikipedia.org/wiki/Thalia_(Muse)");
    expect(wikiUrl("Flag of Peru")).toBe("https://en.wikipedia.org/wiki/Flag_of_Peru");
  });

  it("escapes what a path can't hold", () => {
    expect(wikiUrl("Who's Afraid of Virginia Woolf?")).toBe("https://en.wikipedia.org/wiki/Who's_Afraid_of_Virginia_Woolf%3F");
    expect(wikiUrl("Brasília")).toBe("https://en.wikipedia.org/wiki/Bras%C3%ADlia");
    expect(wikiUrl("Phoenix, Arizona")).toBe("https://en.wikipedia.org/wiki/Phoenix%2C_Arizona");
  });

  it("keeps a section as the fragment", () => {
    expect(wikiUrl("Florence Baptistery#Gates of Paradise")).toBe("https://en.wikipedia.org/wiki/Florence_Baptistery#Gates_of_Paradise");
  });
});
