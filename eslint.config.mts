import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		plugins: {
			'@typescript-eslint': tseslint.plugin as any
		},
		rules: {
			"no-undef": "off",
			"obsidianmd/ui/sentence-case": "off",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/no-tfile-tfolder-cast": "off",
			"obsidianmd/hardcoded-config-path": "off",
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"@typescript-eslint/no-base-to-string": "off",
			"@typescript-eslint/no-deprecated": "off",
			"@typescript-eslint/no-misused-promises": "off",
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-wrapper-object-types": "off",
			"@typescript-eslint/no-unused-vars": "warn",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			"@typescript-eslint/no-require-imports": "warn",
			"no-control-regex": "off",
			"no-console": "off",
			"no-restricted-globals": "off",
			"no-useless-escape": "off",
			"no-alert": "off",
			"no-case-declarations": "off",
			"no-empty": "off",
			"no-extra-boolean-cast": "off",
			"no-useless-catch": "off",
			"obsidianmd/commands/no-command-in-command-id": "off",
			"depend/ban-dependencies": "off",
			"no-async-promise-executor": "off",
			"@typescript-eslint/prefer-promise-reject-errors": "off",
			"@typescript-eslint/no-redundant-type-constituents": "off",
			"@typescript-eslint/no-non-null-asserted-optional-chain": "off",
			"@typescript-eslint/no-this-alias": "off"
		}
	},
	globalIgnores([
		"node_modules/**",
		"dist/**",
		"dist_release/**",
		"yt-evidence-capture/**",
		"error_example/**",
		".github/**",
		"**/*.test.ts",
		"**/*.test.tsx",
		"esbuild.config.mjs",
		"eslint.config.js",
		"eslint.config.mts",
		"version-bump.mjs",
		"versions.json",
		"main.js",
		"styles.css",
		"*.ps1"
	]),
);


