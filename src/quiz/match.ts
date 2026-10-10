import type { Item } from "./format";

// Normalize for comparison: spell out sharps and flats, fold compatibility
// forms (math letters such as 𝒩 or 𝔟 become N and b, subscripts become
// digits), strip diacritics, lowercase, then drop every character that is
// not a letter or digit (spaces, hyphens, apostrophes, periods, brackets).
// "Côte d'Ivoire", "cote d ivoire" and "COTE-DIVOIRE" all become
// "cotedivoire"; "add(𝒩)" and "add N" both become "addn"; "F♯", "F#" and
// "F sharp" all become "fsharp". (A flat written as the letter b, as in
// "Bb", can't be told apart from a b, so it needs its own alias.) Greek
// letters become their names, so "κ → (ω₁)" and "kappa -> (omega_1)" agree,
// and † becomes "dagger".
export function normalize(s: string): string {
  return s
    .replace(/[#♯]/g, "sharp")
    .replace(/♭/g, "flat")
    .replace(/†/g, "dagger")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[α-ω]/g, (c) => GREEK[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const GREEK: Record<string, string> = Object.fromEntries(
  ("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma sigma tau upsilon phi chi psi omega")
    .split(" ").map((name, k) => [String.fromCharCode(0x3b1 + k), name]),
);

export function matchesItem(input: string, item: Item): boolean {
  const n = normalize(input);
  if (n === "") return false;
  return n === normalize(item.canonical) || item.aliases.some((a) => normalize(a) === n);
}

// Index of the first item matching `input`, or -1.
export function findMatch(input: string, items: Item[]): number {
  return items.findIndex((item) => matchesItem(input, item));
}
