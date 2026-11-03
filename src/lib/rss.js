import { decodeEntities } from "./util.js";

/**
 * Minimalistický RSS 2.0 / Atom parser bez závislostí.
 * Vracia pole položiek { title, link, guid, pubDate, description, content, source, sourceUrl, image, categories }.
 */
export function parseFeed(xml) {
  const channelTitle = text(xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/)?.[1] ?? xml.match(/<feed[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "");
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>|<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => m[1] ?? m[2]);
  return { channelTitle, items: blocks.map(parseItem).filter((i) => i.title && i.link) };
}

function parseItem(b) {
  const title = text(tag(b, "title"));
  let link = text(tag(b, "link"));
  if (!link) link = attr(b.match(/<link\b[^>]*rel="alternate"[^>]*>/)?.[0] ?? b.match(/<link\b[^>]*>/)?.[0] ?? "", "href");
  const guid = text(tag(b, "guid")) || text(tag(b, "id"));
  const pubDate = text(tag(b, "pubDate")) || text(tag(b, "dc:date")) || text(tag(b, "published")) || text(tag(b, "updated"));
  const description = tag(b, "description") || tag(b, "summary") || "";
  const content = tag(b, "content:encoded") || tag(b, "content") || "";
  const sourceTag = b.match(/<source\b([^>]*)>([\s\S]*?)<\/source>/);
  const source = sourceTag ? text(sourceTag[2]) : "";
  const sourceUrl = sourceTag ? attr(sourceTag[1], "url") : "";
  const categories = [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/g)].map((m) => text(m[1])).filter(Boolean);
  const image =
    attr(b.match(/<media:content\b[^>]*>/)?.[0] ?? "", "url") ||
    attr(b.match(/<media:thumbnail\b[^>]*>/)?.[0] ?? "", "url") ||
    attr(b.match(/<enclosure\b[^>]*type="image[^>]*>/)?.[0] ?? "", "url") ||
    text(b.match(/<image:url>([\s\S]*?)<\/image:url>/)?.[1] ?? "") ||
    firstImg(cdata(description)) || firstImg(cdata(content)) || "";
  return { title, link, guid, pubDate, description: cdata(description), content: cdata(content), source, sourceUrl, image, categories };
}

function tag(b, name) {
  const re = new RegExp(`<${name.replace(":", "\\:")}\\b[^>]*>([\\s\\S]*?)<\\/${name.replace(":", "\\:")}>`, "i");
  return b.match(re)?.[1] ?? "";
}
function attr(s, name) {
  return decodeEntities(s.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? s.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"))?.[1] ?? "").trim();
}
function cdata(s = "") {
  return s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
}
function text(s = "") {
  return decodeEntities(cdata(s)).replace(/\s+/g, " ").trim();
}
function firstImg(html = "") {
  const src = decodeEntities(html).match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";
  return /^https?:\/\//.test(src) ? src : "";
}
