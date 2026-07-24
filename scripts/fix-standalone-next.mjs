// next build's `output: 'standalone'` mode traces the exact node_modules the
// server needs and copies only those into .next/standalone/node_modules.
// That trace has had platform-specific gaps (seen in practice: a Windows CI
// build produced a standalone folder missing node_modules/next entirely,
// while the exact same source built fine on Linux) — the packaged desktop
// app then crashes on launch with "Cannot find module 'next'".
//
// Rather than depend on the tracer being complete for this one critical
// package, copy the real, fully-installed node_modules/next over whatever
// (possibly incomplete) copy the tracer produced. Runs automatically after
// every `npm run build` (see package.json "postbuild").
import { existsSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const src = join(process.cwd(), 'node_modules', 'next')
const dest = join(process.cwd(), '.next', 'standalone', 'node_modules', 'next')

if (!existsSync(src)) {
  console.error('[fix-standalone-next] node_modules/next not found — skipping (not a standalone build?)')
  process.exit(0)
}
if (!existsSync(join(process.cwd(), '.next', 'standalone'))) {
  // No standalone output (e.g. a plain `next build` for the web deploy, not
  // the Electron packaging path) — nothing to fix.
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log('[fix-standalone-next] Replaced .next/standalone/node_modules/next with the full installed package.')
