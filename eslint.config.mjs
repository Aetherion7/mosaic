import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // eslint-plugin-react-hooks v7 (bundled by eslint-config-next on
      // Next.js 16) ships a new "React Compiler readiness" rule family that
      // assumes every component may be auto-memoized by the compiler. This
      // project doesn't use the React Compiler, and every instance these
      // four rules flagged here turned out to be either a deliberate,
      // working pattern (refs kept fresh during render so keydown/keyboard-
      // shortcut handlers in TopBar/NoteWidget/ReaderWidget never read a
      // stale closure — moving that into useEffect would introduce a real
      // render→commit race instead of fixing anything) or a false positive
      // on plain, render-local computation (Date.now() inside a click
      // handler, an angle accumulator in a pie-chart loop, a closure over a
      // same-scope function). Turned off rather than "fixed" per Copilot's
      // suggestion, which would have rewritten working code to chase a
      // constraint this codebase was never meant to satisfy.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
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
    // Vendorte/minifizierte Drittanbieter-Datei (pdf.js-Worker) — kein
    // eigener Quellcode, erzeugt nur sinnlose Warnungen als minifiziertes Bundle
    "public/*.mjs",
  ]),
]);

export default eslintConfig;
