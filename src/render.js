/**
 * Vygeneruje statický web do dist/ z data/archive.json.
 */
import { mkdirSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, paths, readJson, escapeHtml as h, escapeXml as x, truncate } from "./lib/util.js";

/* ---------- pomocníci pre čas (slovensky, v časovej zóne webu) ---------- */
function makeTime(tz) {
  const dayKeyF = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const timeF = new Intl.DateTimeFormat("sk-SK", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const dayF = new Intl.DateTimeFormat("sk-SK", { timeZone: tz, day: "numeric", month: "long" });
  const fullF = new Intl.DateTimeFormat("sk-SK", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const stampF = new Intl.DateTimeFormat("sk-SK", { timeZone: tz, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  const dayKey = (d) => dayKeyF.format(d);
  const today = dayKey(now), yesterday = dayKey(new Date(now - 86400e3));
  return {
    now, dayKey, today, yesterday,
    time: (d) => timeF.format(d),
    day: (d) => dayF.format(d),
    full: (d) => fullF.format(d),
    stamp: (d) => stampF.format(d),
    dayLabel(d) { const k = dayKey(d); return k === today ? "Dnes" : k === yesterday ? "Včera" : dayF.format(d); },
    rel(d) {
      const s = Math.max(0, (now - d) / 1000);
      if (s < 90) return "práve teraz";
      const m = Math.round(s / 60);
      if (m < 60) return `pred ${m} min`;
      const hrs = Math.round(m / 60);
      if (hrs < 24 && dayKey(d) === today) return hrs === 1 ? "pred hodinou" : `pred ${hrs} h`;
      if (dayKey(d) === yesterday) return `včera ${timeF.format(d)}`;
      return `${dayF.format(d)} ${timeF.format(d)}`;
    },
  };
}

/* ---------- komponenty ---------- */
const fav = (domain) => domain ? `<img class="fav" src="https://www.google.com/s2/favicons?domain=${h(domain)}&amp;sz=64" alt="" width="16" height="16" loading="lazy" referrerpolicy="no-referrer">` : "";
const src = (it) => `<span class="src">${fav(it.source.domain)}<span>${h(it.source.name)}</span></span>`;
const timeEl = (it, T, cls = "") => `<time datetime="${h(it.publishedAt)}" data-rel title="${h(T.stamp(new Date(it.publishedAt)))}"${cls ? ` class="${cls}"` : ""}>${h(T.rel(new Date(it.publishedAt)))}</time>`;
const link = (it, inner, cls = "") => `<a href="${h(it.url)}" target="_blank" rel="noopener"${cls ? ` class="${cls}"` : ""}>${inner}</a>`;
const img = (it, sizes = "(max-width: 820px) 100vw, 40vw") => it.image ? `<img src="${h(it.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" sizes="${sizes}">` : "";

function chip(it, cats, showCat) {
  if (!showCat) return "";
  const c = cats.find((c) => it.categories.includes(c.slug));
  return c ? `<a class="chip" href="/${c.slug}/" style="--cat:${c.color}">${h(c.name)}</a>` : "";
}

function card(it, { variant = "std", cats, showCat = false, withImage = true, color } = {}) {
  const style = color ? ` style="--cat:${color}"` : "";
  const media = withImage && it.image ? link(it, img(it), "card__media") : "";
  return `<article class="card card--${variant}"${style}>
  ${media}
  <div class="card__body">
    <div class="meta">${chip(it, cats, showCat)}${src(it)}${timeEl(it, cats.T)}</div>
    <h3 class="card__title">${link(it, h(it.title))}</h3>
    ${it.summary ? `<p class="card__summary">${h(it.summary)}</p>` : ""}
  </div>
</article>`;
}

function row(it, { cats, showCat = false, thumb = false, summary = true, color } = {}) {
  const T = cats.T;
  const style = color ? ` style="--cat:${color}"` : "";
  const th = thumb && it.image ? link(it, img(it, "112px"), "row__thumb") : "";
  return `<li class="row${th ? " row--thumb" : ""}"${style}>
  <span class="row__time">${timeEl(it, T)}</span>
  <div>
    <h3 class="row__title">${link(it, h(it.title))}</h3>
    ${summary && it.summary ? `<p class="row__summary">${h(it.summary)}</p>` : ""}
    <div class="meta">${chip(it, cats, showCat)}${src(it)}</div>
  </div>
  ${th}
</li>`;
}

const ICON_SEARCH = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const ICON_THEME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/></svg>`;
const ICON_RSS = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="19" r="2"/><path d="M3 9a12 12 0 0 1 12 12h-3a9 9 0 0 0-9-9zM3 3a18 18 0 0 1 18 18h-3A15 15 0 0 0 3 6z"/></svg>`;

function layout(ctx, page) {
  const { site, categories, T, updatedAt } = ctx;
  const url = site.url + page.path;
  const title = page.path === "/" ? `${site.name} – ${site.tagline}` : `${page.title} | ${site.name}`;
  const desc = page.description || site.description;
  const navItems = categories.map((c) => `<a href="/${c.slug}/" style="--cat:${c.color}"${page.active === c.slug ? ' aria-current="page"' : ""}><span class="nav__dot"></span>${h(c.name)}</a>`).join("");
  return `<!doctype html>
<html lang="${site.lang}" data-updated="${h(updatedAt)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
<meta name="description" content="${h(desc)}">
<link rel="canonical" href="${h(url)}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111215" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="${h(site.name)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${h(title)}">
<meta property="og:description" content="${h(desc)}">
<meta property="og:url" content="${h(url)}">
${page.image ? `<meta property="og:image" content="${h(page.image)}">` : ""}
<meta name="twitter:card" content="${page.image ? "summary_large_image" : "summary"}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="${h(site.name)} – všetky správy" href="/feed.xml">
${page.feed ? `<link rel="alternate" type="application/rss+xml" title="${h(site.name)} – ${h(page.title)}" href="${h(page.feed)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600;6..72,700&display=swap">
<link rel="stylesheet" href="/assets/style.css?v=${h(ctx.buildId)}">
<script>try{var t=localStorage.getItem("pp-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
${page.jsonLd ? `<script type="application/ld+json">${JSON.stringify(page.jsonLd)}</script>` : ""}
</head>
<body class="${page.bodyClass || ""}">
<a class="skip" href="#obsah">Preskočiť na obsah</a>
<div class="topbar"><div class="wrap">
  <span>${h(T.full(T.now))}</span>
  <div class="topbar__right">
    <span class="live hide-sm" title="Web sa automaticky obnovuje každých ${ctx.refreshMinutes} minút">Aktualizované ${h(T.rel(new Date(updatedAt)))}</span>
    <a href="/o-nas/">O nás</a>
    <a href="/zdroje/" class="hide-sm">Zdroje</a>
    <a href="/feed.xml" class="hide-sm" title="RSS">RSS</a>
  </div>
</div></div>
<header class="masthead"><div class="wrap">
  <div>
    <a class="logo" href="/" aria-label="${h(site.name)} – domov">Press<span class="logo__point">Point</span><span class="logo__dot" aria-hidden="true"></span></a>
    <p class="masthead__tagline">${h(site.tagline)}</p>
  </div>
  <div class="masthead__tools">
    <form class="search" role="search" action="/hladat/" method="get">
      <input type="search" name="q" placeholder="Hľadať v správach…" aria-label="Hľadať v správach" autocomplete="off">
      <button type="submit" aria-label="Hľadať">${ICON_SEARCH}</button>
    </form>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="Prepnúť tmavý režim" title="Svetlý / tmavý režim">${ICON_THEME}</button>
  </div>
</div></header>
<nav class="nav" aria-label="Rubriky"><div class="wrap">
  <a class="nav__brand" href="/">Press<span class="logo__point">Point</span></a>
  <a href="/"${page.path === "/" ? ' aria-current="page"' : ""} style="--cat:var(--brand)">Domov</a>
  ${navItems}
  <span class="nav__spacer"></span>
  <a href="/hladat/"${page.active === "hladat" ? ' aria-current="page"' : ""} style="--cat:var(--ink)">${ICON_SEARCH} Hľadať</a>
</div></nav>
${page.ticker || ""}
<main id="obsah"><div class="wrap">
${page.body}
</div></main>
<footer><div class="wrap">
  <div class="foot">
    <div>
      <a class="logo" href="/">Press<span class="logo__point">Point</span><span class="logo__dot" aria-hidden="true"></span></a>
      <p class="foot__about">${h(site.description)}</p>
    </div>
    <div><h3>Rubriky</h3><ul>${categories.map((c) => `<li><a href="/${c.slug}/">${h(c.name)}</a></li>`).join("")}</ul></div>
    <div><h3>Web</h3><ul><li><a href="/hladat/">Vyhľadávanie</a></li><li><a href="/zdroje/">Zdroje správ</a></li><li><a href="/o-nas/">O PressPointe</a></li><li><a href="/stav/">Stav aktualizácií</a></li></ul></div>
    <div><h3>RSS</h3><ul><li><a href="/feed.xml">Všetky správy</a></li>${categories.map((c) => `<li><a href="/${c.slug}/feed.xml">${h(c.name)}</a></li>`).join("")}</ul></div>
  </div>
  <div class="foot__bottom">
    <span>© ${T.now.getFullYear()} ${h(site.name)} · ${h(site.domain)}</span>
    <span>Titulky a odkazy pochádzajú z Google News a RSS kanálov médií. Články patria ich vydavateľom a otvárajú sa na pôvodnom webe.</span>
  </div>
</div></footer>
<div class="toast" id="toast" role="status" hidden><span>Pribudli nové správy.</span><button type="button" onclick="location.reload()">Obnoviť</button></div>
<script src="/assets/app.js?v=${h(ctx.buildId)}" defer></script>
</body>
</html>`;
}

/* ---------- stránky ---------- */
function homePage(ctx) {
  const { site, categories, items, cats, T, home } = ctx;
  const used = new Set();
  const take = (pred, n) => { const out = []; for (const it of items) { if (out.length >= n) break; if (!used.has(it.id) && pred(it)) { out.push(it); used.add(it.id); } } return out; };
  const dayAgo = Date.now() - 36 * 3600e3;
  const recent = (it) => new Date(it.publishedAt) > dayAgo;
  const isSport = (it) => it.categories.includes("sport");
  const pick = (preds) => { for (const p of preds) { const [x] = take(p, 1); if (x) return x; } };
  const lead = pick([
    (it) => recent(it) && it.image && it.summary && !isSport(it),
    (it) => recent(it) && it.image && !isSport(it),
    (it) => recent(it) && it.image,
    () => true,
  ]);
  // vedľajšie karty: po jednej z každej rubriky (najprv s obrázkom), potom doplniť
  const secondary = [];
  for (const c of categories) { if (secondary.length >= 4) break; secondary.push(...take((it) => it.image && it.categories[0] === c.slug, 1)); }
  for (const c of categories) { if (secondary.length >= 4) break; if (!secondary.some((it) => it.categories[0] === c.slug)) secondary.push(...take((it) => it.categories[0] === c.slug, 1)); }
  secondary.push(...take(() => true, 4 - secondary.length));
  const latest = take(() => true, home.latest);

  const blocks = categories.map((c) => {
    const list = take((it) => it.categories.includes(c.slug), home.perCategory);
    const withImg = list.filter((it) => it.image); const first = withImg[0] || list[0];
    const rest = list.filter((it) => it !== first);
    return `<section class="block" style="--cat:${c.color}" aria-labelledby="h-${c.slug}">
  <div class="block__head"><div><h2 id="h-${c.slug}"><a href="/${c.slug}/">${h(c.name)}</a></h2><p>${h(c.description)}</p></div><a class="more" href="/${c.slug}/">Všetky správy →</a></div>
  <div class="grid grid--block">
    ${first ? card(first, { variant: "big", cats }) : ""}
    ${rest.slice(0, 2).map((it) => card(it, { variant: "std", cats })).join("")}
    ${rest.slice(2).map((it) => card(it, { variant: "text", cats, withImage: false })).join("")}
  </div>
</section>`;
  }).join("");

  const ticker = `<div class="ticker" aria-label="Najnovšie titulky"><div class="wrap"><span class="ticker__label">Práve teraz</span><div class="ticker__viewport"><div class="ticker__track">${items.slice(0, 14).map((it) => `<a href="${h(it.url)}" target="_blank" rel="noopener" style="--cat:${(categories.find((c) => it.categories.includes(c.slug)) || {}).color || "#999"}"><span class="nav__dot"></span>${h(it.title)}</a>`).join("")}</div></div></div></div>`;

  const body = `
<section class="hero" aria-label="Hlavné správy">
  <div>${lead ? card(lead, { variant: "lead", cats, showCat: true }) : ""}</div>
  <div class="hero__grid">${secondary.map((it) => card(it, { variant: "std", cats, showCat: true })).join("")}</div>
  <aside class="aside hero__aside sticky" aria-labelledby="h-latest">
    <div class="aside__head"><h2 id="h-latest">Najnovšie</h2><a class="more" href="/hladat/" style="--cat:var(--ink-3)">${items.length} článkov</a></div>
    <ol>${latest.map((it) => row(it, { cats, showCat: true, summary: false })).join("")}</ol>
  </aside>
</section>
${blocks}`;
  return layout(ctx, {
    path: "/", title: site.name, body, ticker, image: lead?.image, active: "domov",
    jsonLd: { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: site.url, inLanguage: site.lang, potentialAction: { "@type": "SearchAction", target: `${site.url}/hladat/?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  });
}

function categoryPage(ctx, c) {
  const { site, items, cats, T, categoryPage: cfg, categories } = ctx;
  const list = items.filter((it) => it.categories.includes(c.slug)).slice(0, cfg.maxItems);
  const top = list.filter((it) => it.image).slice(0, 3);
  const topIds = new Set(top.map((it) => it.id));
  const rest = list.filter((it) => !topIds.has(it.id));
  const days = new Map();
  for (const it of rest) { const k = T.dayKey(new Date(it.publishedAt)); if (!days.has(k)) days.set(k, []); days.get(k).push(it); }
  const others = categories.filter((o) => o.slug !== c.slug);
  const sideItems = items.filter((it) => !it.categories.includes(c.slug)).slice(0, 12);
  const body = `
<header class="cat-head" style="--cat:${c.color}">
  <div><span class="eyebrow">Rubrika</span><h1>${h(c.name)}</h1><p>${h(c.description)}</p></div>
  <div class="meta"><span>${list.length} článkov za ${ctx.retentionDays} dní</span><span>Aktualizované ${h(T.rel(new Date(ctx.updatedAt)))}</span><a class="btn" href="/${c.slug}/feed.xml">${ICON_RSS} RSS rubriky</a></div>
</header>
<div class="layout" style="--cat:${c.color}">
  <div>
    ${top.length ? `<div class="grid grid--3">${top.map((it) => card(it, { variant: "big", cats })).join("")}</div>` : ""}
    ${[...days.entries()].map(([k, arr]) => `<section class="day"><h2 class="day__label">${h(T.dayLabel(new Date(arr[0].publishedAt)))}<span>${arr.length} správ</span></h2><ol>${arr.map((it) => row(it, { cats, thumb: true })).join("")}</ol></section>`).join("")}
    ${!list.length ? `<p class="empty">V tejto rubrike zatiaľ nie sú žiadne články. Skúste to o chvíľu.</p>` : ""}
  </div>
  <aside class="aside sticky" aria-labelledby="h-other">
    <div class="aside__head"><h2 id="h-other">Z ostatných rubrík</h2></div>
    <ol>${sideItems.map((it) => row(it, { cats, showCat: true, summary: false })).join("")}</ol>
    <div class="chips" style="margin-bottom:0">${others.map((o) => `<a class="btn" href="/${o.slug}/" style="--cat:${o.color}"><span class="nav__dot"></span>${h(o.name)}</a>`).join("")}</div>
  </aside>
</div>`;
  return layout(ctx, {
    path: `/${c.slug}/`, title: c.name, description: `${c.name} – ${c.description} Najnovšie správy slovenských médií, automaticky aktualizované.`, body, active: c.slug, feed: `/${c.slug}/feed.xml`, image: top[0]?.image,
    jsonLd: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${c.name} | ${site.name}`, url: `${site.url}/${c.slug}/`, inLanguage: site.lang, isPartOf: { "@type": "WebSite", name: site.name, url: site.url } },
  });
}

function searchPage(ctx) {
  const { categories } = ctx;
  const body = `
<div class="page" id="search-app" data-cats='${h(JSON.stringify(categories.map(({ slug, name, color }) => ({ slug, name, color }))))}'>
  <span class="eyebrow" style="--cat:var(--ink-3)">Vyhľadávanie</span>
  <h1>Hľadať v správach</h1>
  <form class="search search--big" role="search" action="/hladat/" method="get"><input type="search" name="q" id="q" placeholder="Napr. inflácia, hokej, kampaň…" aria-label="Hľadaný výraz" autocomplete="off" autofocus><button type="submit" aria-label="Hľadať">${ICON_SEARCH}</button></form>
  <div class="chips" id="cat-chips"><button type="button" data-cat="" aria-pressed="true">Všetko</button>${categories.map((c) => `<button type="button" data-cat="${c.slug}" style="--cat:${c.color}" aria-pressed="false">${h(c.name)}</button>`).join("")}</div>
  <p class="meta" id="search-status">Načítavam správy…</p>
</div>
<ol id="search-results" class="results"></ol>`;
  return layout(ctx, { path: "/hladat/", title: "Vyhľadávanie", description: "Prehľadajte správy z posledných dní vo všetkých rubrikách PressPointu.", body, active: "hladat" });
}

function sourcesPage(ctx) {
  const { items, categories } = ctx;
  const map = new Map();
  for (const it of items) { const k = it.source.domain || it.source.name; if (!map.has(k)) map.set(k, { ...it.source, count: 0, cats: new Set() }); const s = map.get(k); s.count++; it.categories.forEach((c) => s.cats.add(c)); }
  const list = [...map.values()].sort((a, b) => b.count - a.count);
  const body = `<div class="page"><span class="eyebrow" style="--cat:var(--ink-3)">Odkiaľ berieme správy</span><h1>Zdroje</h1>
<p>Za posledných ${ctx.retentionDays} dní sme zachytili ${items.length} článkov od ${list.length} médií. Každý titulok vedie na pôvodný článok u vydavateľa.</p></div>
<div class="sources">${list.map((s) => `<a class="source" href="${h(s.url || "#")}" target="_blank" rel="noopener">${fav(s.domain)}<div><b>${h(s.name)}</b><span>${h(s.domain)} · ${[...s.cats].map((c) => categories.find((x) => x.slug === c)?.name).filter(Boolean).join(", ")}</span></div><em>${s.count}</em></a>`).join("")}</div>`;
  return layout(ctx, { path: "/zdroje/", title: "Zdroje", description: "Prehľad médií, z ktorých PressPoint preberá titulky.", body, active: "zdroje" });
}

function aboutPage(ctx) {
  const { site, categories } = ctx;
  const body = `<div class="page"><span class="eyebrow" style="--cat:var(--brand)">O webe</span><h1>O PressPointe</h1>
<p>${h(site.description)}</p>
<p>Web nemá redakciu, ktorá by články písala. Namiesto toho každých ${ctx.refreshMinutes} minút automaticky prejde Google News a RSS kanály slovenských médií, odstráni duplicity a zoradí správy do piatich rubrík. Každý titulok vedie na pôvodný článok u vydavateľa, kde si ho prečítate celý.</p>
<h2>Rubriky</h2>
<ul>${categories.map((c) => `<li><a href="/${c.slug}/" style="color:${c.color}"><b>${h(c.name)}</b></a> – ${h(c.description)}</li>`).join("")}</ul>
<h2>Ako to funguje</h2>
<ul><li>Zdroje sú verejné RSS kanály a vyhľadávacie feedy Google News v slovenčine.</li><li>Preberáme len titulok, krátky perex, názov zdroja a odkaz. Celé články nekopírujeme.</li><li>Správy staršie ako ${ctx.retentionDays} dní z prehľadu miznú.</li><li>Ak ste vydavateľ a neprajete si, aby sa vaše titulky zobrazovali, napíšte nám na <a href="mailto:${h(site.contactEmail)}">${h(site.contactEmail)}</a>.</li></ul>
<h2>RSS</h2>
<p>Všetky správy: <a href="/feed.xml">${h(site.url)}/feed.xml</a>. Každá rubrika má aj vlastný kanál, nájdete ho v pätičke.</p>
</div>`;
  return layout(ctx, { path: "/o-nas/", title: "O nás", body, active: "o-nas" });
}

function statusPage(ctx) {
  const { lastRun, T, items, categories } = ctx;
  const feeds = lastRun?.feeds || [];
  const body = `<div class="page"><span class="eyebrow" style="--cat:var(--ink-3)">Technický stav</span><h1>Stav aktualizácií</h1>
<p>Posledný beh: ${lastRun ? `${h(T.stamp(new Date(lastRun.at)))} (${h(T.rel(new Date(lastRun.at)))})` : "zatiaľ žiadny"}. Ďalší beh je naplánovaný približne o ${ctx.refreshMinutes} minút po predchádzajúcom.</p></div>
<div class="stats">
  <div class="stat"><b>${items.length}</b><span>článkov v archíve</span></div>
  <div class="stat"><b>${lastRun?.added ?? 0}</b><span>nových v poslednom behu</span></div>
  <div class="stat"><b>${lastRun?.merged ?? 0}</b><span>zlúčených duplicít</span></div>
  <div class="stat"><b>${feeds.filter((f) => f.ok).length}/${feeds.length}</b><span>feedov v poriadku</span></div>
</div>
<table class="table"><thead><tr><th>Rubrika</th><th>Feed</th><th>Stav</th><th>Položiek</th><th>Nových</th><th>Čas</th></tr></thead><tbody>
${feeds.map((f) => `<tr><td style="color:${categories.find((c) => c.slug === f.category)?.color}"><b>${h(categories.find((c) => c.slug === f.category)?.name || f.category)}</b></td><td><a href="${h(f.url)}" target="_blank" rel="noopener">${h(f.feed)}</a></td><td>${f.ok ? '<span class="ok">OK</span>' : `<span class="err">Chyba</span> <small>${h(f.error || "")}</small>`}</td><td>${f.items ?? "–"}</td><td>${f.fresh ?? "–"}</td><td>${f.ms} ms</td></tr>`).join("")}
</tbody></table>`;
  return layout(ctx, { path: "/stav/", title: "Stav aktualizácií", body, active: "stav" });
}

function notFoundPage(ctx) {
  const body = `<div class="page"><span class="eyebrow">Chyba 404</span><h1>Táto stránka neexistuje</h1><p>Možno bola presunutá alebo ste zle opísali adresu. Skúste <a href="/">domovskú stránku</a> alebo <a href="/hladat/">vyhľadávanie</a>.</p></div>`;
  return layout(ctx, { path: "/404.html", title: "Stránka sa nenašla", body });
}

/* ---------- RSS, sitemap, dáta ---------- */
function rss(ctx, title, path, list, description) {
  const { site } = ctx;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${x(title)}</title>
<link>${x(site.url + path)}</link>
<atom:link href="${x(site.url + path + "feed.xml")}" rel="self" type="application/rss+xml"/>
<description>${x(description)}</description>
<language>${site.lang}</language>
<lastBuildDate>${new Date(ctx.updatedAt).toUTCString()}</lastBuildDate>
${list.map((it) => `<item><title>${x(it.title)}</title><link>${x(it.url)}</link><guid isPermaLink="false">${x(it.id)}</guid><pubDate>${new Date(it.publishedAt).toUTCString()}</pubDate><source url="${x(it.source.url || it.url)}">${x(it.source.name)}</source>${it.categories.map((c) => `<category>${x(ctx.categories.find((k) => k.slug === c)?.name || c)}</category>`).join("")}<description>${x((it.summary ? it.summary + " " : "") + `(${it.source.name})`)}</description>${it.image ? `<enclosure url="${x(it.image)}" type="image/jpeg" length="0"/>` : ""}</item>`).join("\n")}
</channel>
</rss>`;
}

function sitemap(ctx) {
  const { site, categories, updatedAt } = ctx;
  const urls = ["/", ...categories.map((c) => `/${c.slug}/`), "/hladat/", "/zdroje/", "/o-nas/"];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${x(site.url + u)}</loc><lastmod>${updatedAt}</lastmod><changefreq>${u === "/" || categories.some((c) => `/${c.slug}/` === u) ? "hourly" : "weekly"}</changefreq></url>`).join("\n")}\n</urlset>\n`;
}

/* ---------- hlavná funkcia ---------- */
export function render(config = loadConfig()) {
  const archive = readJson(paths.archive, { items: [], updatedAt: new Date().toISOString() });
  const lastRun = readJson(paths.lastRun, null);
  const T = makeTime(config.site.timezone);
  const items = archive.items.filter((it) => it.title && it.url);
  const cats = Object.assign([...config.categories], { T });
  const ctx = { ...config, cats, items, lastRun, T, updatedAt: archive.updatedAt || new Date().toISOString(), buildId: Date.now().toString(36) };

  const out = (rel, content) => { const f = join(paths.dist, rel); mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, content); };
  mkdirSync(join(paths.dist, "assets"), { recursive: true });
  for (const f of readdirSync(paths.static)) copyFileSync(join(paths.static, f), join(paths.dist, "assets", f));

  out("index.html", homePage(ctx));
  out("404.html", notFoundPage(ctx));
  out("hladat/index.html", searchPage(ctx));
  out("zdroje/index.html", sourcesPage(ctx));
  out("o-nas/index.html", aboutPage(ctx));
  out("stav/index.html", statusPage(ctx));
  out("feed.xml", rss(ctx, `${config.site.name} – všetky správy`, "/", items.slice(0, 60), config.site.description));
  for (const c of config.categories) {
    out(`${c.slug}/index.html`, categoryPage(ctx, c));
    out(`${c.slug}/feed.xml`, rss(ctx, `${config.site.name} – ${c.name}`, `/${c.slug}/`, items.filter((it) => it.categories.includes(c.slug)).slice(0, 50), c.description));
  }
  out("sitemap.xml", sitemap(ctx));
  out("robots.txt", `User-agent: *\nAllow: /\nDisallow: /stav/\nSitemap: ${config.site.url}/sitemap.xml\n`);
  out("CNAME", config.site.domain + "\n");
  out("manifest.webmanifest", JSON.stringify({ name: config.site.name, short_name: config.site.name, start_url: "/", display: "standalone", background_color: "#f6f5f2", theme_color: "#d7263d", lang: config.site.lang, icons: [{ src: "/assets/favicon.svg", sizes: "any", type: "image/svg+xml" }] }));
  out("data/meta.json", JSON.stringify({ updatedAt: ctx.updatedAt, total: items.length, categories: Object.fromEntries(config.categories.map((c) => [c.slug, items.filter((it) => it.categories.includes(c.slug)).length])) }));
  out("data/latest.json", JSON.stringify({ updatedAt: ctx.updatedAt, items: items.slice(0, 2000).map(({ id, title, url, source, publishedAt, categories, image, summary }) => ({ id, title, url, source: { name: source.name, domain: source.domain }, publishedAt, categories, image, summary })) }));
  console.log(`Web vygenerovaný: ${items.length} článkov, ${config.categories.length} rubrík → ${paths.dist}`);
  return ctx;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  render();
}
