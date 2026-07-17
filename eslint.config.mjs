import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "alert", message: "Use the shared SteadFast prompt system." },
        { name: "confirm", message: "Use the shared SteadFast prompt system." },
        { name: "prompt", message: "Use the shared SteadFast prompt system." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.object.name='window'][callee.property.name='alert']", message: "Use the shared SteadFast prompt system." },
        { selector: "CallExpression[callee.object.name='window'][callee.property.name='confirm']", message: "Use the shared SteadFast prompt system." },
        { selector: "CallExpression[callee.object.name='window'][callee.property.name='prompt']", message: "Use the shared SteadFast prompt system." },
        { selector: "CallExpression[callee.object.name='globalThis'][callee.property.name='alert']", message: "Use the shared SteadFast prompt system." },
        { selector: "CallExpression[callee.object.name='globalThis'][callee.property.name='confirm']", message: "Use the shared SteadFast prompt system." },
        { selector: "CallExpression[callee.object.name='globalThis'][callee.property.name='prompt']", message: "Use the shared SteadFast prompt system." },
      ],
    },
  },
  globalIgnores([".next/**", ".vercel/**", ".media-test-build/**", "out/**", "coverage/**", "tools/**"]),
]);
