// Wikipedia links. A quiz names an article by its title (format.ts), with
// an optional section after `#`.

export function wikiUrl(title: string): string {
  const [page, ...section] = title.split("#");
  const part = (s: string) => encodeURIComponent(s.trim().replace(/ /g, "_"));
  return `https://en.wikipedia.org/wiki/${part(page)}${section.length ? `#${part(section.join("#"))}` : ""}`;
}
