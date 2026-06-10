import esbuild from "esbuild";
import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import process from "process";

const prod = process.argv[2] === "production";

// Plugin to extract CSS to dist/styles.css and copy manifest.json
const cssPlugin = {
  name: "css-extract",
  setup(build) {
    const cssChunks = [];
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = readFileSync(args.path, "utf8");
      cssChunks.push(css);
      return { contents: "", loader: "js" };
    });
    build.onEnd(() => {
      if (!existsSync("dist")) {
        mkdirSync("dist");
      }
      if (cssChunks.length > 0) {
        writeFileSync("dist/styles.css", cssChunks.join("\n"));
        cssChunks.length = 0;
      }
      if (existsSync("manifest.json")) {
        copyFileSync("manifest.json", "dist/manifest.json");
      }
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "dist/main.js",
  plugins: [cssPlugin],
  alias: {
    "react": "preact/compat",
    "react-dom": "preact/compat",
    "react/jsx-runtime": "preact/jsx-runtime",
  },
  define: {
    "process.env.NODE_ENV": prod ? '"production"' : '"development"',
  },
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
