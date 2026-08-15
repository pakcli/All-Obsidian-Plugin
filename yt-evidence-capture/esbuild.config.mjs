import esbuild from "esbuild";
import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import process from "process";
import { builtinModules as builtins } from "node:module";
import { join } from "path";

const prod = process.argv[2] === "production";

const banner = `/*
YT Evidence Capture — Obsidian Plugin
Bundled by esbuild.
*/`;

// ── Post-build: copy to root + auto-deploy to .vaultpath ──────────────────────

async function postBuild() {
  // Copy to root (required for release artifacts)
  if (existsSync("dist/main.js")) copyFileSync("dist/main.js", "main.js");
  if (existsSync("dist/styles.css")) copyFileSync("dist/styles.css", "styles.css");

  // Auto-deploy to vault if .vaultpath exists
  if (existsSync(".vaultpath")) {
    try {
      const vaultPath = readFileSync(".vaultpath", "utf8").trim().split(/\r?\n/)[0];
      if (vaultPath) {
        if (!existsSync(vaultPath)) mkdirSync(vaultPath, { recursive: true });
        if (existsSync("main.js"))      copyFileSync("main.js",      join(vaultPath, "main.js"));
        if (existsSync("manifest.json"))copyFileSync("manifest.json", join(vaultPath, "manifest.json"));
        if (existsSync("styles.css"))   copyFileSync("styles.css",    join(vaultPath, "styles.css"));
        console.log(`[deploy] Copied artifacts to: ${vaultPath}`);
      }
    } catch (err) {
      console.error("[deploy] Failed to copy to .vaultpath:", err);
    }
  }
}

const postBuildPlugin = {
  name: "post-build",
  setup(build) {
    build.onEnd(async () => { await postBuild(); });
  },
};

// ── Main bundle ───────────────────────────────────────────────────────────────

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [postBuildPlugin],
});

if (prod) {
  await context.rebuild();
  await postBuild();
  process.exit(0);
} else {
  await context.watch();
}
