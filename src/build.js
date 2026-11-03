/** Jednorazové zostavenie: stiahne správy a vygeneruje web. `--no-fetch` iba prerenderuje. */
import { fetchAll } from "./fetch.js";
import { render } from "./render.js";
import { loadConfig } from "./lib/util.js";

const config = loadConfig();
if (!process.argv.includes("--no-fetch")) await fetchAll(config);
render(config);
