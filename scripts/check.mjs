import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "vendor") return [];
      return walk(fullPath);
    }
    return entry.isFile() ? [fullPath] : [];
  });
}

const javascriptFiles = [
  path.join(root, "public", "sw.js"),
  ...["server", "scripts", "test", "public/js"].flatMap((directory) =>
    walk(path.join(root, directory)).filter((file) => file.endsWith(".js") || file.endsWith(".mjs"))
  )
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    errors.push(`${path.relative(root, file)}: ${(result.stderr || result.stdout).trim()}`);
  }
}

const requiredFiles = [
  "public/index.html",
  "public/sw.js",
  "public/manifest.webmanifest",
  "public/favicon.png",
  "public/css/styles.css",
  "public/css/base.css",
  "public/css/home.css",
  "public/css/dialogs.css",
  "public/css/checkout.css",
  "public/css/orders.css",
  "public/css/admin.css",
  "public/css/responsive.css",
  "public/js/app.js",
  "public/assets/logo.svg",
  "public/assets/favicon.svg",
  "public/images/placeholder.svg",
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/apple-touch-icon.png",
  "public/vendor/leaflet/leaflet.js",
  "public/vendor/leaflet/leaflet.css"
];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

function publicPath(filePath) {
  const clean = decodeURIComponent(filePath.split(/[?#]/)[0]);
  if (clean === "/") return "public/index.html";
  if (!clean.startsWith("/")) return null;
  return path.join("public", clean.slice(1));
}

function requirePublicFile(filePath, source) {
  const relativePath = publicPath(filePath);
  if (!relativePath) return;
  if (!fs.existsSync(path.join(root, relativePath))) {
    errors.push(`${source}: missing local asset ${filePath}`);
  }
}

const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  requirePublicFile(match[1], "public/index.html");
}

for (const cssFile of walk(path.join(root, "public/css")).filter((file) => file.endsWith(".css"))) {
  const css = fs.readFileSync(cssFile, "utf8");
  for (const match of css.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)/g)) {
    requirePublicFile(match[1], path.relative(root, cssFile));
  }
}

for (const jsFile of walk(path.join(root, "public/js")).filter((file) => file.endsWith(".js"))) {
  const source = fs.readFileSync(jsFile, "utf8");
  for (const match of source.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = path.resolve(path.dirname(jsFile), match[1]);
    if (!fs.existsSync(target)) {
      errors.push(`${path.relative(root, jsFile)}: missing module ${match[1]}`);
    }
  }
}

const serviceWorker = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
const precacheMatch = serviceWorker.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!precacheMatch) {
  errors.push("public/sw.js: PRECACHE list not found");
} else {
  for (const match of precacheMatch[1].matchAll(/"([^"]+)"/g)) {
    requirePublicFile(match[1], "public/sw.js precache");
  }
}

let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, "public/manifest.webmanifest"), "utf8"));
} catch {
  void 0;
}
const manifestIcons = manifest
  ? [...(manifest.icons || []), ...(manifest.shortcuts || []).flatMap((shortcut) => shortcut.icons || [])]
  : [];
for (const icon of manifestIcons) {
  requirePublicFile(icon.src, "public/manifest.webmanifest");
}

for (const relativePath of ["public/manifest.webmanifest", "package.json"]) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) continue;
  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON (${error.message})`);
  }
}

if (errors.length) {
  console.error(`Check failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:\n`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Checked ${javascriptFiles.length} JavaScript files and ${requiredFiles.length} required assets.`);
