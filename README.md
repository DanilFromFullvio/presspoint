# PressPoint

Slovenský spravodajský web, ktorý sa **sám plní** z Google News a RSS kanálov slovenských médií.
Bez databázy, bez CMS, bez závislostí – čistý Node.js (18+). Výstupom je statický web v `dist/`,
ktorý sa dá hostovať kdekoľvek (GitHub Pages, Cloudflare Pages, VPS, Docker).

Rubriky: **Marketing · Ekonomika · Šport · Politika · Ryba**

## Rýchly štart

```bash
node src/build.js        # stiahne správy + vygeneruje dist/
npm start                # server na http://localhost:8080, obnovuje web každých 20 min
```

Ďalšie príkazy:

| Príkaz | Čo robí |
|---|---|
| `node src/fetch.js` | len stiahne feedy a aktualizuje `data/archive.json` |
| `node src/render.js` | len prerenderuje `dist/` z archívu (bez sťahovania) |
| `node src/build.js --no-fetch` | to isté ako render |
| `node src/serve.js --port 8080` | server + automatické obnovovanie |

## Ako to funguje

1. **`src/fetch.js`** prejde všetky feedy z `config/site.json`:
   - `topic` – tematický feed Google News (`BUSINESS`, `SPORTS`, `NATION`, `WORLD`, `TECHNOLOGY`, …),
   - `search` – vyhľadávací feed Google News (`q`), podporuje `OR`, úvodzovky, `site:domena.sk` a `when:7d`,
   - `rss` – ľubovoľný RSS/Atom kanál média (s obrázkami a perexmi).
2. Články sa znormalizujú (odstráni sa „ - Zdroj“ z titulku, UTM parametre, HTML), **deduplikujú** podľa odkazu
   aj podľa titulku a zlúčia s archívom `data/archive.json`. Ak ten istý článok príde z Google News aj z priameho RSS,
   zostane priamy odkaz, obrázok a perex.
3. **`src/render.js`** vygeneruje:
   - domov `/`, rubriky `/marketing/`, `/ekonomika/`, `/sport/`, `/politika/`, `/ryba/`,
   - vyhľadávanie `/hladat/` (klientské, nad `data/latest.json`), zdroje `/zdroje/`, o nás `/o-nas/`, technický stav `/stav/`,
   - RSS `/feed.xml` + `/{rubrika}/feed.xml`, `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, `404.html`.
4. Stránky si samy každých 5 minút overia `data/meta.json` a ak pribudla nová verzia, ponúknu obnovenie.

Články staršie ako `retentionDays` (14 dní) z archívu vypadnú.

## Konfigurácia (`config/site.json`)

```jsonc
{
  "site": { "name": "PressPoint", "domain": "presspoint.sk", "url": "https://presspoint.sk", ... },
  "refreshMinutes": 20,          // ako často server obnovuje web
  "retentionDays": 14,           // ako dlho držať články
  "categories": [
    {
      "slug": "ryba", "name": "Ryba", "color": "#2471a3",
      "description": "Rybárstvo, rybolov, rybári…",
      "exclude": "horoskop|znamen(ie|í|ia)",          // regex – titulky, ktoré do rubriky nepatria
      "feeds": [
        { "type": "search", "q": "rybári OR rybolov when:14d" },
        { "type": "search", "q": "site:srzrada.sk when:30d" },
        { "type": "rss", "url": "https://hnonline.sk/rss", "name": "HNonline",
          "categoryFilter": "^Slovensko$",              // regex na <category> položky v RSS
          "urlFilter": "/slovensko/",                   // regex na URL článku
          "limit": 40 }                                 // max položiek z feedu na jeden beh
      ]
    }
  ]
}
```

Pridať rubriku = pridať objekt do `categories`. Pridať zdroj = pridať riadok do `feeds`. Nič iné netreba meniť.

## Automatické plnenie

Web sa plní troma spôsobmi, vyberte si podľa hostingu:

### A) GitHub Pages (zadarmo, odporúčané na začiatok)
`.github/workflows/build.yml` beží **každých 30 minút**, stiahne správy, uloží archív do repozitára a nasadí `dist/` na GitHub Pages.

1. Vytvorte repozitár na GitHube a pushnite tento adresár (`main`).
2. *Settings → Pages → Source: GitHub Actions*.
3. Workflow spustite ručne (*Actions → Build & deploy PressPoint → Run workflow*) alebo počkajte na cron.
4. Kým web beží na adrese `https://<používateľ>.github.io/<repozitár>/`, workflow nastavuje premennú `SITE_URL`
   na túto adresu – web sa vygeneruje pre podpriečinok a súbor `CNAME` sa negeneruje.
5. Doména: po jej získaní zmažte `SITE_URL` z workflow, nastavte *Settings → Pages → Custom domain* = `presspoint.sk`
   (súbor `CNAME` sa potom generuje automaticky, lebo doména v `config/site.json` sa zhoduje s adresou webu).

Aktuálne nasadenie: https://danilfromfullvio.github.io/presspoint/

### B) Vlastný server / Docker
```bash
docker build -t presspoint .
docker run -d --name presspoint -p 8080:8080 -v presspoint-data:/app/data --restart unless-stopped presspoint
```
Server pri štarte stiahne správy a potom ich obnovuje každých `refreshMinutes`. Pred neho dajte reverznú proxy s HTTPS, napr. Caddy:
```
presspoint.sk, www.presspoint.sk {
    reverse_proxy localhost:8080
}
```
Bez Dockeru: `npm start` pod `systemd` alebo `pm2`.

### C) Cloudflare Pages / Netlify / Vercel
Build command `node src/build.js`, publish directory `dist`. Pravidelné zostavenie zabezpečí *Deploy hook* volaný z cronu
(napr. cron-job.org každých 30 min) alebo GitHub Action, ktorá hook zavolá.

## Nasadenie na presspoint.sk

1. **Kúpa domény** – .sk domény registruje ktorýkoľvek SK-NIC registrátor (Websupport, WebHouse, Active24, Forpsi…), cena cca 12–15 € / rok.
2. **DNS** podľa zvoleného hostingu:
   - GitHub Pages: `A` záznamy `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` a `CNAME www → <používateľ>.github.io`;
   - Cloudflare Pages: `CNAME presspoint.sk → <projekt>.pages.dev` (Cloudflare povoľuje CNAME aj na koreňovej doméne);
   - VPS: `A presspoint.sk → IP servera`, `CNAME www → presspoint.sk`.
3. V `config/site.json` skontrolujte `site.url` a `site.domain` – používajú sa v canonical URL, RSS a sitemape.

## Právne upozornenie

RSS Google News je podľa Googlu určené na *osobné, nekomerčné* použitie v čítačkách. Pre verejný (a najmä komerčný) web
preto odporúčame postupne presúvať váhu na **priame RSS kanály médií** (typ `rss`), ktoré sú na to určené, prípadne sa
s vydavateľmi dohodnúť. Web preberá len titulok, krátky perex a odkaz; celé články nekopíruje a každý odkaz vedie
na pôvodný web vydavateľa.

## Štruktúra

```
config/site.json      konfigurácia webu, rubrík a feedov
src/fetch.js          sťahovanie + deduplikácia + archív
src/render.js         generovanie HTML/RSS/sitemap
src/build.js          fetch + render
src/serve.js          HTTP server s automatickým obnovovaním
src/lib/rss.js        RSS/Atom parser bez závislostí
src/lib/util.js       pomocné funkcie
static/               style.css, app.js, favicon.svg (kopírujú sa do dist/assets)
data/archive.json     archív článkov (generovaný, commituje sa v GitHub Actions)
data/last-run.json    štatistika posledného behu (zobrazuje sa na /stav/)
dist/                 vygenerovaný web (negeneruje sa do gitu)
```
