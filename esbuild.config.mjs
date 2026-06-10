import esbuild from "esbuild";
import { writeFileSync, readFileSync } from "fs";
import process from "process";

const prod = process.argv[2] === "production";

// Plugin to extract CSS to styles.css
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
      if (cssChunks.length > 0) {
        writeFileSync("styles.css", cssChunks.join("\n"));
        cssChunks.length = 0;
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
  outfile: "main.js",
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
