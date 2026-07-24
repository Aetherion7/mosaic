import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Zum Testen auf einem anderen LAN-Gerät (Handy/Tablet) während `npm run dev`:
  // eigene lokale IP hier eintragen, z.B. allowedDevOrigins: ['192.168.1.42'].
  // Nicht nötig für den normalen Betrieb — Next.js meldet sich sonst mit einer
  // Cross-Origin-Warnung, sobald du von einer anderen Origin aus zugreifst.

  // "standalone": bündelt einen minimalen Node-Server + genau die node_modules,
  // die er braucht, nach .next/standalone. Die Electron-Desktop-App (electron/
  // main.js) startet genau diesen Server lokal und lädt ihn im App-Fenster —
  // dafür (nicht für den normalen Web-Betrieb via `npm run start`) ist dieser
  // Modus da. public/ und .next/static kopiert electron-builder separat dazu
  // (electron-builder-Konfig in package.json → extraResources), weil
  // "standalone" laut Next.js-Doku genau diese zwei Ordner bewusst auslässt.
  output: 'standalone',
};

export default nextConfig;
