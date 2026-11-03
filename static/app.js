/* PressPoint – klientská logika: relatívne časy, tmavý režim, upozornenie na nové správy, vyhľadávanie */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* --- relatívny čas po slovensky --- */
  const timeF = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit" });
  const dayF = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long" });
  const dayKey = (d) => d.toDateString();
  function rel(iso) {
    const d = new Date(iso), now = new Date();
    const s = Math.max(0, (now - d) / 1000);
    if (s < 90) return "práve teraz";
    const m = Math.round(s / 60);
    if (m < 60) return `pred ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24 && dayKey(d) === dayKey(now)) return h === 1 ? "pred hodinou" : `pred ${h} h`;
    if (dayKey(d) === dayKey(new Date(now - 864e5))) return `včera ${timeF.format(d)}`;
    return `${dayF.format(d)} ${timeF.format(d)}`;
  }
  function tick() { $$("time[data-rel]").forEach((t) => { t.textContent = rel(t.getAttribute("datetime")); }); }
  tick(); setInterval(tick, 60e3);

  /* --- pokazené obrázky schováme --- */
  document.addEventListener("error", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement)) return;
    const media = el.closest(".card__media, .row__thumb");
    if (media) { media.remove(); return; }
    if (el.classList.contains("fav")) el.style.visibility = "hidden";
  }, true);

  /* --- tmavý režim --- */
  const root = document.documentElement;
  $("[data-theme-toggle]")?.addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("pp-theme", root.dataset.theme); } catch {}
  });

  /* --- upozornenie, keď server vygeneroval novšiu verziu --- */
  const built = root.dataset.updated;
  const toast = $("#toast");
  async function check() {
    try {
      const r = await fetch("/data/meta.json", { cache: "no-store" });
      const m = await r.json();
      if (m.updatedAt && built && m.updatedAt !== built) { toast.hidden = false; requestAnimationFrame(() => (toast.dataset.show = "1")); }
    } catch {}
  }
  if (toast) { setInterval(check, 5 * 60e3); document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); }); }

  /* --- vyhľadávanie --- */
  const app = $("#search-app");
  if (!app) return;
  const cats = JSON.parse(app.dataset.cats);
  const input = $("#q"), status = $("#search-status"), results = $("#search-results"), chips = $$("#cat-chips button");
  let items = [], cat = "";
  const fold = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  input.value = params.get("q") || "";
  if (cats.some((c) => c.slug === params.get("rubrika"))) cat = params.get("rubrika");
  chips.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === cat)));

  function run() {
    const q = fold(input.value.trim());
    const words = q.split(/\s+/).filter(Boolean);
    const list = items.filter((it) => (!cat || it.categories.includes(cat)) && words.every((w) => it._t.includes(w))).slice(0, 200);
    const total = items.filter((it) => !cat || it.categories.includes(cat)).length;
    status.textContent = words.length ? `${list.length} výsledkov pre „${input.value.trim()}“` : `Najnovších ${list.length} z ${total} článkov. Zadajte hľadaný výraz.`;
    results.innerHTML = list.map((it) => {
      const c = cats.find((c) => it.categories.includes(c.slug));
      return `<li class="row" style="--cat:${c ? c.color : "#999"}"><span class="row__time"><time datetime="${esc(it.publishedAt)}" data-rel>${esc(rel(it.publishedAt))}</time></span><div><h3 class="row__title"><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a></h3>${it.summary ? `<p class="row__summary">${esc(it.summary)}</p>` : ""}<div class="meta">${c ? `<a class="chip" href="/${c.slug}/">${esc(c.name)}</a>` : ""}<span class="src"><img class="fav" src="https://www.google.com/s2/favicons?domain=${esc(it.source.domain)}&amp;sz=64" alt="" width="16" height="16" loading="lazy" referrerpolicy="no-referrer"><span>${esc(it.source.name)}</span></span></div></div></li>`;
    }).join("") || `<li class="empty">Nič sme nenašli. Skúste kratší alebo iný výraz.</li>`;
    const u = new URL(location.href);
    input.value.trim() ? u.searchParams.set("q", input.value.trim()) : u.searchParams.delete("q");
    cat ? u.searchParams.set("rubrika", cat) : u.searchParams.delete("rubrika");
    history.replaceState(null, "", u);
  }
  let timer; input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  app.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); run(); });
  chips.forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; chips.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); run(); }));
  fetch("/data/latest.json").then((r) => r.json()).then((d) => {
    items = d.items.map((it) => ({ ...it, _t: fold(`${it.title} ${it.summary} ${it.source.name}`) }));
    run();
  }).catch(() => { status.textContent = "Správy sa nepodarilo načítať."; });
})();
