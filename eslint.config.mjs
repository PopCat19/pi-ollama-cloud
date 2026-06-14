// ESLint Config — strictTypeChecked with phased-warn strategy
// See: https://pocketarc.com/typescript

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintSecurity from "eslint-plugin-security";

export default tseslint.config(
	eslint.configs.recommended,
	eslintSecurity.configs.recommended,
	{
		rules: {
			"security/detect-object-injection": "off",
		},
	},
	...tseslint.configs.strictTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		ignores: ["node_modules/**"],
	},
	{
		rules: {
			"no-var": "error",
			"@typescript-eslint/no-duplicate-type-constituents": "error",
			"@typescript-eslint/no-redundant-type-constituents": "error",
			"@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": false }],
			"@typescript-eslint/no-useless-constructor": "error",
			"@typescript-eslint/no-duplicate-enum-values": "error",
			"@typescript-eslint/no-unnecessary-type-parameters": "error",

			"eqeqeq": "warn",
			"@typescript-eslint/no-deprecated": "warn",
			"@typescript-eslint/ban-ts-comment": "warn",
			"@typescript-eslint/no-unsafe-function-type": "warn",
			"@typescript-eslint/no-floating-promises": "warn",
			"no-irregular-whitespace": "warn",
			"@typescript-eslint/no-implied-eval": "warn",
			"@typescript-eslint/no-extraneous-class": "warn",

			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-member-access": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/no-unsafe-return": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
			"@typescript-eslint/no-unsafe-enum-comparison": "warn",
			"@typescript-eslint/restrict-plus-operands": "warn",
			"@typescript-eslint/restrict-template-expressions": "warn",

			"@typescript-eslint/no-non-null-assertion": "warn",
			"@typescript-eslint/no-confusing-void-expression": "warn",
			"@typescript-eslint/no-unnecessary-condition": "warn",
			"@typescript-eslint/no-unnecessary-type-assertion": "warn",
			"@typescript-eslint/no-unnecessary-boolean-literal-compare": "warn",
			"@typescript-eslint/no-unnecessary-type-conversion": "warn",
			"@typescript-eslint/no-unnecessary-template-expression": "warn",
			"@typescript-eslint/unbound-method": "warn",
			"@typescript-eslint/prefer-literal-enum-member": "warn",
			"@typescript-eslint/use-unknown-in-catch-callback-variable": "warn",

			"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-this-alias": "off",
			"no-constant-condition": "off",
			"no-prototype-builtins": "off",
			"prefer-const": "warn",
		},
	},
);
