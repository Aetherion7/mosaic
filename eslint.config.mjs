import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Electron-Shell: eigenständiges CommonJS-Node-Skript außerhalb der
    // Next.js-App (electron/package.json, kein "type": "module") — braucht
    // require() und folgt bewusst nicht den ESM-/TS-Konventionen der App.
    "electron/**",
    // Release-Build-Ausgabe von electron-builder
    "release/**",
  ]),
]);

export default eslintConfig;
