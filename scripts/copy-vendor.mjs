import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "leaflet", "dist");
const target = path.join(root, "public", "vendor", "leaflet");

if (!fs.existsSync(source)) {
  console.error("Leaflet is not installed. Run npm install first.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log("Copied Leaflet assets to public/vendor/leaflet");
