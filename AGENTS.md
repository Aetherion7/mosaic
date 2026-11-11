<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Projektkonzeption

Die vollständige Konzeption des Projekts (Vision, Architektur, Widget-System,
Designsprache, Datumslogik, Qualitätsregeln) steht in **[KONZEPT.md](KONZEPT.md)**.
Vor größeren Änderungen lesen — insbesondere die Registrierungs-Checkliste für
neue Widgets (§ 5.2), die Designsprache (§ 6) und die Datums-Regeln (§ 8).

# Release-Regel (Wunsch des Maintainers)

Jede fertige Änderung an der App wird **immer vollständig released** — nicht nur
gepusht oder als Testbuild gebaut. Ablauf:

1. Qualitätsprüfungen: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
2. Version (Patch) in `package.json`, `electron/package.json` und beiden
   `package-lock.json` erhöhen.
3. Pull Request nach `master` erstellen und (Squash) mergen.
4. Workflow `release.yml` per `workflow_dispatch` auf `master` mit Input
   `tag: vX.Y.Z` starten (Tags lassen sich aus der Cloud-Umgebung nicht pushen).
5. Prüfen, dass der Lauf grün ist und das Release die Installer **und**
   `latest*.yml` / `*.blockmap` enthält — sonst findet das In-App-Update die
   neue Version nicht.

Reine Website-Änderungen (`docs/`) brauchen kein App-Release.
