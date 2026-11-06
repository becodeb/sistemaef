// Empaqueta el servidor en dist/server/index.mjs; las dependencias quedan externas
// (se instalan con `npm prune --omit=dev` en la imagen).
import { build } from "esbuild";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

await build({
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: Object.keys(pkg.dependencies ?? {}),
  alias: { "@shared": "./src/shared", "@server": "./src/server" },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server/index.mjs",
});
