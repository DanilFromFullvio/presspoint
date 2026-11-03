/**
 * Produkčný/lokálny server: servíruje dist/ a každých `refreshMinutes` znovu stiahne správy a prerenderuje web.
 * Použitie: node src/serve.js [--port 8080] [--no-initial-fetch]
 */
import { createServer } from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fetchAll } from "./fetch.js";
import { render } from "./render.js";
import { loadConfig, paths } from "./lib/util.js";

const args = process.argv.slice(2);
const port = Number(process.env.PORT || (args.includes("--port") ? args[args.indexOf("--port") + 1] : 8080));
const config = loadConfig();
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon" };

let building = false;
async function rebuild(reason) {
  if (building) return;
  building = true;
  const t = Date.now();
  console.log(`\n[${new Date().toISOString()}] Aktualizácia (${reason})…`);
  try { await fetchAll(config); } catch (e) { console.error("Sťahovanie zlyhalo:", e.message); }
  try { render(config); } catch (e) { console.error("Generovanie zlyhalo:", e.message); }
  console.log(`Hotovo za ${((Date.now() - t) / 1000).toFixed(1)} s. Ďalšia aktualizácia o ${config.refreshMinutes} min.`);
  building = false;
}

function send(res, file, status = 200) {
  const type = MIME[extname(file)] || "application/octet-stream";
  const isHtml = type.startsWith("text/html");
  res.writeHead(status, {
    "content-type": type,
    "cache-control": isHtml || file.endsWith("meta.json") ? "no-cache" : "public, max-age=300",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(paths.dist, urlPath));
  if (!file.startsWith(paths.dist)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!urlPath.endsWith("/")) { res.writeHead(301, { location: urlPath + "/" }).end(); return; }
    file = join(file, "index.html");
  }
  if (existsSync(file) && statSync(file).isFile()) return send(res, file);
  const nf = join(paths.dist, "404.html");
  if (existsSync(nf)) return send(res, nf, 404);
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Stránka sa pripravuje, skúste o chvíľu.");
});

server.listen(port, () => console.log(`PressPoint beží na http://localhost:${port}`));
if (!args.includes("--no-initial-fetch") || !existsSync(join(paths.dist, "index.html"))) rebuild("štart");
else console.log("Používam existujúci dist/, prvá aktualizácia o", config.refreshMinutes, "min.");
const timer = setInterval(() => rebuild("plán"), config.refreshMinutes * 60e3);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { clearInterval(timer); server.close(() => process.exit(0)); });
