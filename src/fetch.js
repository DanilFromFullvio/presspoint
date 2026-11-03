/**
 * Stiahne všetky nakonfigurované feedy (Google News + priame RSS), znormalizuje články,
 * zlúči ich s archívom (data/archive.json) a zapíše štatistiku behu (data/last-run.json).
 */
import { pathToFileURL } from "node:url";
import { parseFeed } from "./lib/rss.js";
import { loadConfig, paths, readJson, writeJson, sha1, stripTags, titleKey, cleanUrl, domainOf, truncate } from "./lib/util.js";

export function feedUrl(feed, gn) {
  const p = new URLSearchParams({ hl: gn.hl, gl: gn.gl, ceid: gn.ceid });
  if (feed.type === "topic") return `https://news.google.com/rss/headlines/section/topic/${feed.id}?${p}`;
  if (feed.type === "search") return `https://news.google.com/rss/search?q=${encodeURIComponent(feed.q)}&${p}`;
  if (feed.type === "rss") return feed.url;
  throw new Error(`Neznámy typ feedu: ${feed.type}`);
}

export function feedLabel(feed) {
  if (feed.type === "topic") return `Google News · téma ${feed.id}`;
  if (feed.type === "search") return `Google News · „${feed.q.replace(/\s*when:\w+/, "")}“`;
  return `RSS · ${feed.name || domainOf(feed.url)}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, { timeoutMs, userAgent }, attempt = 1) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "follow", headers: { "user-agent": userAgent, accept: "application/rss+xml, application/xml, text/xml, */*" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    if (attempt < 3) { await sleep(attempt * 2000); return fetchText(url, { timeoutMs, userAgent }, attempt + 1); }
    throw e;
  } finally { clearTimeout(t); }
}

/** Google News pripája za titulok " - Zdroj"; odstránime ho. */
function stripSourceSuffix(title, source) {
  if (source && title.toLowerCase().endsWith(` - ${source.toLowerCase()}`)) return title.slice(0, -(source.length + 3)).trim();
  return title.replace(/\s+-\s+[^-]{2,40}$/, "").trim() || title;
}

function normalize(raw, feed, category, channelTitle) {
  const isGoogle = feed.type !== "rss";
  const link = cleanUrl(raw.link);
  let sourceName, sourceUrl, title = raw.title;
  if (isGoogle) {
    sourceName = raw.source || "Google News";
    sourceUrl = raw.sourceUrl || "";
    title = stripSourceSuffix(title, raw.source);
  } else {
    sourceName = feed.name || channelTitle || domainOf(link);
    sourceUrl = `https://${domainOf(link)}`;
  }
  const date = new Date(raw.pubDate);
  const publishedAt = isNaN(date) ? new Date().toISOString() : date.toISOString();
  // Google News description obsahuje len odkaz + zdroj – nie je to perex.
  let summary = isGoogle ? "" : truncate(stripTags(raw.description || raw.content), 220);
  if (summary && titleKey(summary) === titleKey(title)) summary = "";
  return {
    id: sha1(isGoogle ? (raw.guid || link) : link),
    title,
    url: link,
    isGoogleLink: /news\.google\.com/.test(link),
    source: { name: sourceName, domain: domainOf(sourceUrl || link) || domainOf(link), url: sourceUrl },
    publishedAt,
    firstSeenAt: new Date().toISOString(),
    categories: [category.slug],
    image: raw.image || "",
    summary,
    via: isGoogle ? "googlenews" : "rss",
  };
}

/** Zlúči novú položku s existujúcou (preferuje priamy odkaz, obrázok a perex). */
function merge(existing, incoming) {
  const out = { ...existing };
  out.categories = [...new Set([...existing.categories, ...incoming.categories])];
  if (existing.isGoogleLink && !incoming.isGoogleLink) { out.url = incoming.url; out.isGoogleLink = false; out.source = incoming.source; }
  if (!out.image && incoming.image) out.image = incoming.image;
  if (!out.summary && incoming.summary) out.summary = incoming.summary;
  if (new Date(incoming.publishedAt) < new Date(existing.publishedAt)) out.publishedAt = incoming.publishedAt;
  if (!out.source.domain && incoming.source.domain) out.source = incoming.source;
  return out;
}

async function pool(tasks, limit) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) await tasks[i++]();
  }));
}

export async function fetchAll(config = loadConfig()) {
  const archive = readJson(paths.archive, { items: [] });
  const byId = new Map(archive.items.map((it) => [it.id, it]));
  const byTitle = new Map(archive.items.map((it) => [titleKey(it.title), it.id]));
  const stats = [];
  let added = 0, merged = 0, excluded = 0;
  const perFeedLimit = config.fetch.perFeedLimit ?? 80;

  // Úlohy zoskupíme podľa hostiteľa, aby sme jeden server nezahltili (SME vracia 429 pri súbežných požiadavkách).
  const byHost = new Map();
  const xmlCache = new Map(); // ten istý feed použitý vo viacerých rubrikách sťahujeme len raz
  for (const category of config.categories) {
    const exclude = category.exclude ? new RegExp(category.exclude, "i") : null;
    for (const feed of category.feeds) {
      const url = feedUrl(feed, config.googleNews);
      const urlFilter = feed.urlFilter ? new RegExp(feed.urlFilter, "i") : null;
      const categoryFilter = feed.categoryFilter ? new RegExp(feed.categoryFilter, "i") : null;
      const host = domainOf(url).split(".").slice(-2).join("."); // zoskupenie podľa hlavnej domény (sme.sk = ekonomika.sme.sk + domov.sme.sk …)
      if (!byHost.has(host)) byHost.set(host, []);
      byHost.get(host).push(async () => {
        const started = Date.now();
        try {
          const xml = xmlCache.get(url) ?? await fetchText(url, config.fetch);
          xmlCache.set(url, xml);
          const { channelTitle, items } = parseFeed(xml);
          let fresh = 0, skipped = 0;
          for (const raw of items.slice(0, feed.limit ?? perFeedLimit)) {
            const item = normalize(raw, feed, category, channelTitle);
            if (!item.title) continue;
            if (categoryFilter && !raw.categories.some((c) => categoryFilter.test(c))) { skipped++; continue; }
            if ((urlFilter && !urlFilter.test(item.url)) || (exclude && exclude.test(item.title))) { skipped++; excluded++; continue; }
            const tk = titleKey(item.title);
            const dupId = byId.has(item.id) ? item.id : byTitle.get(tk);
            if (dupId && byId.has(dupId)) {
              const before = byId.get(dupId);
              const after = merge(before, item);
              byId.set(dupId, after);
              if (after.categories.length !== before.categories.length || after.url !== before.url || after.image !== before.image) merged++;
            } else {
              byId.set(item.id, item); byTitle.set(tk, item.id); added++; fresh++;
            }
          }
          stats.push({ category: category.slug, feed: feedLabel(feed), url, ok: true, items: items.length, fresh, skipped, ms: Date.now() - started });
          console.log(`✓ ${category.slug.padEnd(10)} ${String(items.length).padStart(3)} položiek, ${String(fresh).padStart(3)} nových  ${feedLabel(feed)}`);
        } catch (e) {
          stats.push({ category: category.slug, feed: feedLabel(feed), url, ok: false, error: e.message, ms: Date.now() - started });
          console.warn(`✗ ${category.slug.padEnd(10)} CHYBA ${e.message}  ${feedLabel(feed)}`);
        }
      });
    }
  }
  const runners = [...byHost.entries()].map(([host, list]) => async () => {
    const delay = /google\./.test(host) ? 250 : (config.fetch.perHostDelayMs ?? 1500);
    for (let i = 0; i < list.length; i++) { if (i) await sleep(delay); await list[i](); }
  });
  await pool(runners, config.fetch.concurrency);

  const cutoff = Date.now() - config.retentionDays * 86400e3;
  const items = [...byId.values()]
    .filter((it) => new Date(it.publishedAt).getTime() >= cutoff && new Date(it.publishedAt).getTime() <= Date.now() + 3600e3)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, config.maxArchiveItems);

  const run = { at: new Date().toISOString(), added, merged, excluded, total: items.length, failed: stats.filter((s) => !s.ok).length, feeds: stats.sort((a, b) => a.category.localeCompare(b.category)) };
  writeJson(paths.archive, { updatedAt: run.at, items });
  writeJson(paths.lastRun, run);
  console.log(`\nArchív: ${items.length} článkov (+${added} nových, ${merged} zlúčených, ${excluded} vylúčených), ${run.failed} feedov zlyhalo.`);
  return run;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchAll().catch((e) => { console.error(e); process.exit(1); });
}
