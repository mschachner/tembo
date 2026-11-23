import { asset } from "../app";
import { openUrl } from "../backend";
import { h } from "../dom";
import type { Item, Quiz } from "../quiz/format";
import { daysBetween, localDate, type QuizState } from "../schedule";
import { wikiUrl } from "../wiki";

export function imageFor(quiz: Quiz, item: Item): HTMLImageElement | null {
  const rel = item.prompt?.image;
  if (!rel) return null;
  const height = item.prompt?.imageHeight ?? quiz.imageHeight;
  const img = h("img", { class: "prompt-image", alt: item.prompt?.text ?? "", style: `--image-height: ${height}px` });
  asset(quiz.dir, rel).then(
    (url) => { img.src = url; },
    (e) => { img.replaceWith(h("span", { class: "error" }, String(e))); },
  );
  return img;
}

// `link` makes the prompt a link to its Wikipedia article, when it has one:
// for screens shown after a quiz, never during play.
export function promptNode(quiz: Quiz, item: Item, link = false): Node[] {
  const img = imageFor(quiz, item);
  const text = item.prompt?.text ?? "";
  const wiki = link ? item.prompt?.wiki : undefined;
  // When there is an image, the text is its alt; don't show it twice.
  return img ? [wikiLink(wiki, img)] : [h("div", { class: "prompt-text" }, wikiLink(wiki, text))];
}

// What an item is asked with, for the tables shown after a quiz: its prompt
// (text or picture), or for an item without one, its data values. Nothing
// for an item that has neither (a plain list quiz) or is no longer in the
// quiz. `link` as in promptNode.
export function clueNode(quiz: Quiz, item: Item | undefined, link = false): Node[] {
  if (!item) return [];
  if (item.prompt) return promptNode(quiz, item, link);
  const values = item.data.filter((v) => v !== "");
  return values.length ? [document.createTextNode(values.join(" · "))] : [];
}

export function hasClue(item: Item | undefined): boolean {
  return !!item && (!!item.prompt || item.data.some((v) => v !== ""));
}

export function openWiki(title: string): void {
  openUrl(wikiUrl(title)).catch((e) => console.error("could not open", title, e));
}

// `content` as a link that opens the Wikipedia article `title` in the
// browser, or `content` itself when there is no article. There is no href:
// the app's own window must never navigate away.
export function wikiLink(title: string | undefined, content: Node | string): Node {
  const node = typeof content === "string" ? document.createTextNode(content) : content;
  if (!title) return node;
  return h("a", {
    class: `wiki ${node instanceof HTMLImageElement ? "image" : ""}`.trim(), role: "link", "data-tip": `Wikipedia: ${title}`,
    onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); openWiki(title); },
  }, node);
}

// An item's answer as shown after a quiz: linked to its article, if any.
export function answerNode(item: Item, text: Node | string = item.canonical): Node {
  return wikiLink(item.wiki, text);
}

export function dueLabel(state: QuizState, today = localDate(new Date())): string {
  if (state.dueDate === null) return "";
  const n = daysBetween(today, state.dueDate);
  if (n <= 0) return n === 0 ? "due today" : `${-n}d overdue`;
  return n === 1 ? "tomorrow" : `in ${n}d`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${localDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const fmtSecs = (x: number | null) => (x === null ? "" : `${x.toFixed(1)}s`);
export const fmtNum = (x: number | null) => (x === null ? "" : String(x));
