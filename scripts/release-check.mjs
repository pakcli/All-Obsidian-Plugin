/**
 * Obsidian Community Plugin Pre-Release Validation Script
 * Verifies manifest rules, versions.json sync, TypeScript types, ESLint rules, and release assets.
 */
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";

console.log("========================================");
console.log("🔍 Running Obsidian Pre-Release Checks");
console.log("========================================");

let passed = true;

function logPass(msg) {
  console.log(`✅ [PASS] ${msg}`);
}

function logFail(msg) {
  console.error(`❌ [FAIL] ${msg}`);
  passed = false;
}

// 1. Validate manifest.json
const manifestPath = path.resolve("manifest.json");
if (!existsSync(manifestPath)) {
  logFail("manifest.json missing at project root!");
} else {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const required = ["id", "name", "version", "minAppVersion", "description"];
    const missing = required.filter((field) => !manifest[field]);

    if (missing.length > 0) {
      logFail(`manifest.json is missing required fields: ${missing.join(", ")}`);
    } else {
      logPass(`manifest.json valid (ID: ${manifest.id}, Version: ${manifest.version}, MinApp: ${manifest.minAppVersion})`);

      // 2. Validate versions.json mapping
      const versionsPath = path.resolve("versions.json");
      if (!existsSync(versionsPath)) {
        logFail("versions.json missing at project root!");
      } else {
        const versions = JSON.parse(readFileSync(versionsPath, "utf8"));
        if (!versions[manifest.version]) {
          logFail(`versions.json does not map version "${manifest.version}" to minAppVersion "${manifest.minAppVersion}"`);
        } else {
          logPass(`versions.json maps "${manifest.version}" -> "${versions[manifest.version]}"`);
        }
      }
    }
  } catch (err) {
    logFail(`Failed to parse manifest.json: ${err.message}`);
  }
}

// 3. Run TypeScript check
try {
  console.log("\n⏳ Running TypeScript TypeCheck...");
  execSync("npx tsc --noEmit --skipLibCheck", { stdio: "inherit" });
  logPass("TypeScript TypeCheck passed (0 errors)");
} catch {
  logFail("TypeScript compilation errors detected!");
}

// 4. Run ESLint check
try {
  console.log("\n⏳ Running ESLint (Obsidian Rule Compliance)...");
  execSync("npx eslint src/", { stdio: "inherit" });
  logPass("ESLint analysis passed (0 errors)");
} catch {
  logFail("ESLint reported errors or Obsidian rule violations!");
}

// 5. Verify Build & Assets
try {
  console.log("\n⏳ Running Production Bundle Build...");
  execSync("npm run build", { stdio: "inherit" });

  if (existsSync("main.js") || existsSync("dist/main.js")) {
    logPass("main.js release artifact created successfully");
  } else {
    logFail("main.js release artifact not found after build!");
  }
} catch {
  logFail("Production build failed!");
}

console.log("\n========================================");
if (passed) {
  console.log("🎉 ALL PRE-RELEASE CHECKS PASSED!");
  console.log("Your plugin is ready for Obsidian Community Catalog submission!");
  console.log("========================================");
  process.exit(0);
} else {
  console.error("⛔ PRE-RELEASE CHECKS FAILED! Please fix the errors above before publishing.");
  console.log("========================================");
  process.exit(1);
}
