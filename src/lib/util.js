import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const paths = {
  config: resolve(ROOT, "config", "site.json"),
  archive: resolve(ROOT, "data", "archive.json"),
  lastRun: resolve(ROOT, "data", "last-run.json"),
  static: resolve(ROOT, "static"),
  dist: resolve(ROOT, "dist"),
};

export function loadConfig() {
  const config = JSON.parse(readFileSync(paths.config, "utf8"));
  // SITE_URL (napr. https://user.github.io/repo) prebije adresu z configu – hodí sa pri nasadení do podpriečinka.
  const url = (process.env.SITE_URL || config.site.url || "").replace(/\/+$/, "");
  config.site.url = url;
  config.site.basePath = url ? new URL(url).pathname.replace(/\/+$/, "") : "";
  return config;
}

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 1));
}

export function sha1(s) {
  return createHash("sha1").update(String(s)).digest("hex").slice(0, 16);
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", copy: "©" };
export function decodeEntities(s = "") {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));
}

export function stripTags(html = "") {
  return decodeEntities(html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function escapeXml(s = "") {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

/** Kľúč pre porovnanie titulkov (bez diakritiky, interpunkcie a veľkosti písmen). */
export function titleKey(title = "") {
  return title
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanUrl(url = "") {
  try {
    const u = new URL(url.trim());
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|mc_cid|mc_eid)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch { return url.trim(); }
}

export function domainOf(url = "") {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function truncate(s = "", n = 180) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 30)).trim() + "…";
}
