import type { Item } from "./format";

// Normalize for comparison: strip diacritics, lowercase, then drop every
// character that is not a letter or digit (spaces, hyphens, apostrophes,
// periods). "Côte d'Ivoire", "cote d ivoire" and "COTE-DIVOIRE" all become
// "cotedivoire".
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function matchesItem(input: string, item: Item): boolean {
  const n = normalize(input);
  if (n === "") return false;
  return n === normalize(item.canonical) || item.aliases.some((a) => normalize(a) === n);
}

// Index of the first item matching `input`, or -1.
export function findMatch(input: string, items: Item[]): number {
  return items.findIndex((item) => matchesItem(input, item));
}
