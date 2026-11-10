// Cada build le pone una versión nueva al service worker: así los teléfonos bajan la app actualizada
// y borran la anterior.
import fs from "node:fs";

const file = "dist/client/sw.js";
const src = fs.readFileSync(file, "utf8");
if (!src.includes("__BUILD__")) throw new Error("sw.js no tiene la marca __BUILD__");
fs.writeFileSync(file, src.replace("__BUILD__", Date.now().toString(36)));
