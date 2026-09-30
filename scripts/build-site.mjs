// Assemble the deployable static site: the game lobby + dice at "/", the Ashfall slot at "/ashfall/"
// and the Submariner crash game at "/submariner/".
// Run via `pnpm build:site` after both Vite builds; output is <repo>/dist (what vercel.json serves).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = resolve(root, "web/dist");
const slot = resolve(root, "games/ashfall/dist");
const sub = resolve(root, "games/submariner/dist");
const out = resolve(root, "dist");

for (const [name, dir] of [["web", web], ["ashfall", slot], ["submariner", sub]]) {
  if (!existsSync(resolve(dir, "index.html"))) {
    console.error(`build-site: ${name} build missing at ${dir} - run \`pnpm --filter ${name} build\` first`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(web, out, { recursive: true });
cpSync(slot, resolve(out, "ashfall"), { recursive: true });
cpSync(sub, resolve(out, "submariner"), { recursive: true });
console.log(`build-site: ${out}\n  /             ← web/dist\n  /ashfall/     ← games/ashfall/dist\n  /submariner/  ← games/submariner/dist`);
