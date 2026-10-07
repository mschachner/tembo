import { describe, expect, it } from "vitest";
import { shuffled } from "./shuffle";

function lcg(seed: number): () => number {
  return () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
}

describe("shuffled", () => {
  it("is a permutation and leaves the input alone", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const ys = shuffled(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ys.slice().sort()).toEqual(xs.slice().sort());
  });
  it("is deterministic given the random source", () => {
    expect(shuffled([1, 2, 3, 4, 5], lcg(7))).toEqual(shuffled([1, 2, 3, 4, 5], lcg(7)));
  });
});
