<div align="center">

<br><br>

<img src="public/mosaiclogo-round.png" alt="" width="76" height="76" valign="middle">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/mosaic-wordmark-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="public/mosaic-wordmark-light.png">
  <img src="public/mosaic-wordmark-dark.png" alt="mosaic" height="54" valign="middle">
</picture>

<br><br>

**A local-first, widget-based personal dashboard.**
Boards full of tasks, notes, calendars, trackers, and more — in your browser or as a desktop app.
No account. No server. Your data stays on your device.

[![CI](https://github.com/Aetherion7/mosaic/actions/workflows/ci.yml/badge.svg)](https://github.com/Aetherion7/mosaic/actions/workflows/ci.yml)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE.md)
[![Latest release](https://img.shields.io/github/v/release/Aetherion7/mosaic?label=release)](https://github.com/Aetherion7/mosaic/releases/latest)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/mosaicboard)

[Download](#download) · [Features](#features) · [Getting started](#getting-started) · [Contributing](#contributing) · [Support the project](#support-the-project)

</div>

---

<img src="docs/screenshots/board.png" alt="The same mosaic board shown across four different themes, split diagonally: timer, agenda, calendar, weather, clock, map, sleep, water, table, reader, note and quicklinks widgets" width="100%">

## What is mosaic?

mosaic is a dashboard you actually own. Instead of a wall of unrelated apps and tabs, you arrange
**widgets** — tasks, a calendar, notes, trackers, a reader, a spreadsheet, and more — onto **boards**
that look and behave exactly the way you want. Everything lives in your browser's IndexedDB; there
is no mosaic server and no account, so there's nothing to sign up for and nothing that can lock you
out of your own data.

- **16 widget types** — task/habit tracking, notes with custom fonts/color/shadow/outline, calendar,
  spreadsheet with formulas, drawboard, PDF/EPUB reader with highlights, charts, weather, map, clock,
  timer, water and sleep tracking, agenda, quicklinks, and images.
- **18 built-in themes** (plus your own custom ones) — from Deep Space to Soft Light, each with its
  own accent colors and background pattern; every widget can additionally be styled individually.
- **Optional AI assistant (bring your own key)** — connect your own Anthropic/OpenAI/Gemini (or any
  OpenAI-compatible) API key and let it build and manage boards with you, or open a mini chat scoped
  to a single widget. Your key and your prompts go straight from your browser to your chosen
  provider — never through a mosaic server, because none exists.
- **Works everywhere** — responsive desktop and mobile layouts, plus native desktop apps for
  Windows, macOS, and Linux with automatic updates.
- **Local-first by design** — boards, widgets, and settings never leave your device. See
  [Privacy & data](#privacy--data) for the handful of widgets that talk to external services
  (maps, weather, the optional AI) and exactly what they send.
- **Bilingual** — full English/German UI, switchable anytime.

## Download

| Platform | Download |
|---|---|
| Windows | [Latest `.exe` installer](https://github.com/Aetherion7/mosaic/releases/latest) |
| macOS | [Latest `.dmg`](https://github.com/Aetherion7/mosaic/releases/latest) |
| Linux | [Latest `.AppImage` / `.deb`](https://github.com/Aetherion7/mosaic/releases/latest) |
| Browser | No install — [run it locally](#getting-started) or host it yourself |

Each link opens the release page; download the asset for your platform from the list of files
attached to it. The desktop app checks for updates automatically and installs them in the
background — you'll always be on the latest version.

> [!WARNING]
> **Windows and macOS will warn about an "unknown publisher" on first launch.** The builds
> aren't code-signed — a Windows certificate costs $70–400/year and a macOS one requires a paid
> Apple Developer account, both from a registered business/identity (see
> [GITHUB_SETUP.md](GITHUB_SETUP.md#code-signing-optional-costs-money) for exactly what that
> involves) — so this isn't something a single-developer project can just turn off. The warning
> means "this publisher isn't verified," not "this file is malware." Nothing in mosaic phones
> home or reads files outside your own boards (see [Privacy & data](#privacy--data)); the source
> is fully in this repo and the build pipeline is the public [`release.yml`](.github/workflows/release.yml)
> workflow, so the `.exe`/`.dmg` you download is exactly what that workflow produced from this
> code, nothing more. To proceed anyway:
> - **Windows**: click "More info", then "Run anyway" in the SmartScreen dialog.
> - **macOS**: current macOS versions usually skip the old "unidentified developer" dialog
>   entirely and instead say **"'mosaic' is damaged and can't be opened. You should move it to
>   the Trash."** — despite the wording, the download isn't actually corrupted; that's just
>   Gatekeeper's generic message for any app without a paid Developer ID signature. Right-click →
>   "Open" alone no longer clears it on current macOS. Move `mosaic.app` to `/Applications`, then
>   in Terminal run:
>   ```bash
>   xattr -cr /Applications/mosaic.app
>   ```
>   and launch it normally.
>
> If you'd rather not click through a warning at all, the [Linux install](#linux-install) below
> and [running from source](#getting-started) don't trigger this, since neither goes through
> Gatekeeper/SmartScreen.

### Linux install

Only `.deb` and `.AppImage` are published — no native `.rpm` or Arch package — so Debian-based
distros get a real package install, everyone else runs the portable `.AppImage`. Each command
below looks up the current release's exact asset URL itself (via the GitHub API) and pipes it
into a plain `sh -c`, so there's no version number to edit and nothing that depends on which
shell you're pasting into — it works the same in bash, zsh, and fish.

**Debian-based** (Debian, Ubuntu, Linux Mint, Pop!_OS, elementary OS, ...):
```sh
curl -s https://api.github.com/repos/Aetherion7/mosaic/releases/latest | grep browser_download_url | grep '\.deb"' | cut -d '"' -f4 \
  | xargs -I{} sh -c 'wget "$1" && sudo apt install "./$(basename "$1")"' _ {}
```
`apt install ./file.deb` (not `dpkg -i`) resolves and pulls in missing dependencies automatically.

**Arch-based** (Arch, Manjaro, EndeavourOS, CachyOS, ...) — no AUR package (yet), run the `.AppImage`:
```sh
sudo pacman -S --needed fuse2
curl -s https://api.github.com/repos/Aetherion7/mosaic/releases/latest | grep browser_download_url | grep '\.AppImage"' | cut -d '"' -f4 \
  | xargs -I{} sh -c 'wget "$1" && chmod +x "$(basename "$1")" && "./$(basename "$1")"' _ {}
```

**Fedora-based** (Fedora, Nobara, RHEL, ...) — no `.rpm` (yet), same `.AppImage`:
```sh
sudo dnf install -y fuse
curl -s https://api.github.com/repos/Aetherion7/mosaic/releases/latest | grep browser_download_url | grep '\.AppImage"' | cut -d '"' -f4 \
  | xargs -I{} sh -c 'wget "$1" && chmod +x "$(basename "$1")" && "./$(basename "$1")"' _ {}
```

AppImages need the FUSE2 runtime (`libfuse.so.2`), which many current distros — including Arch
and Fedora — no longer install by default (only FUSE3). Without it you'll get `dlopen(): error
loading libfuse.so.2`; the `pacman`/`dnf` line above installs the missing compat library. Debian-
based systems don't need this at all since they use the `.deb` package, not the AppImage.

Any other distro (openSUSE, NixOS, ...) — same idea: install a `fuse2`/`libfuse2` compat package
if it's missing, then run the same `.AppImage` command as above.

The commands above run the AppImage directly from your Downloads folder — that first run is also
all it takes to install it properly: mosaic adds itself to your applications menu with a proper
icon (writes a `.desktop` entry + icon under `~/.local/share`, picked up automatically by GNOME,
KDE, XFCE, ...), so after that you can launch it like any other installed app instead of digging
the file back out of a terminal every time. The `.deb` install gets this the normal way, via `apt`.

## Features

<table>
<tr>
<td width="50%">

**Boards & widgets**
- Infinite canvas or fixed grid layout per board
- Drag, resize, duplicate, lock, and style every widget
- Undo/redo, board templates, folders, search
- Import/export boards and full backups as JSON

</td>
<td width="50%">

<img src="docs/screenshots/home.png" alt="Board overview with a folder and multiple boards" width="100%">

</td>
</tr>
<tr>
<td width="50%">

<img src="docs/screenshots/themes.png" alt="Theme picker with 18 themes, plus background and grid pattern options" width="100%">

</td>
<td width="50%">

**Themes & appearance**
- 18 built-in themes (dark and light), plus custom themes via JSON
- Per-widget styling: color, gradient, border, shadow, glow, transparency
- Two header styles, animation toggle, keyboard-shortcut hints

</td>
</tr>
<tr>
<td width="50%">

**AI assistant (bring your own key)**
- Board-wide assistant that can add/edit/style widgets and switch themes
- Per-widget mini chat, scoped so it can only touch that one widget
- Works with Anthropic, OpenAI, Gemini, or any OpenAI-compatible endpoint
  (including local models via Ollama/LM Studio)
- Fully optional — disable it entirely in Settings

</td>
<td width="50%">

<img src="docs/screenshots/ai-assistant.png" alt="Per-widget AI chat open on a table widget, with changes scoped to just that widget" width="100%">

</td>
</tr>
</table>

## Getting started

Run mosaic locally in about a minute:

```bash
git clone https://github.com/Aetherion7/mosaic.git
cd mosaic
npm install
npm run dev
```

Open **http://localhost:3001**. That's it — no database, no `.env` file, no account.

Prefer the packaged desktop app? Grab it from [Download](#download), or build it yourself:

```bash
npm run electron:dev     # dev mode — hot reload, same as `npm run dev` in an Electron window
npm run electron:pack    # unpacked build for your current OS (for testing)
npm run electron:dist    # installer for your current OS
```

Cross-platform installers (Windows/macOS/Linux, code-signed if you've set up certificates) are built
automatically by [`.github/workflows/release.yml`](.github/workflows/release.yml) whenever a `v*` tag
is pushed — see [GITHUB_SETUP.md](GITHUB_SETUP.md) for the full release process.

### Requirements

- Node.js 20+
- npm (the repo is developed against `npm ci`/`package-lock.json`)

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server on port 3001 |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm test` | Run the unit test suite (Vitest) |
| `npm run lint` | Lint the codebase |
| `npm run electron:dev` | Run the desktop app against the dev server |
| `npm run electron:dist` | Build a desktop installer for your current OS |

## Privacy & data

Everything you create — boards, widgets, settings — lives exclusively in your browser's IndexedDB
and localStorage. There is no mosaic backend to send it to.

The exceptions, all optional and all documented in-app under **Settings → Privacy**:

- The **map** and **weather** widgets fetch data from OpenStreetMap/Nominatim and Open-Meteo when used.
- The **quicklinks** widget fetches favicons from DuckDuckGo.
- The **AI assistant**, if you enable and configure it, sends your messages directly to the provider
  you chose (your API key never touches anything but that provider).

No tracking, no analytics, no ads.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Zustand · IndexedDB · Framer Motion · Tiptap ·
dnd-kit · react-pdf · epub.js · Leaflet · Electron (desktop) · Vitest

## Contributing

Bug reports, feature ideas, and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md)
for how the project is organized and what to know before opening a PR. mosaic is source-available
under a noncommercial license (see [below](#license)); by contributing you agree your changes are
licensed under the same terms.

New to GitHub or not sure how forking/PRs work? [GITHUB_SETUP.md](GITHUB_SETUP.md) also covers the
basics.

## Support the project

mosaic is free and always will be for personal use. If it's useful to you, a donation helps cover
the time that goes into it:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/mosaicboard)

No pressure at all — using it, starring the repo, or reporting a bug is just as appreciated.

## License

mosaic is source-available under the **[PolyForm Noncommercial License 1.0.0](LICENSE.md)**: free to
use, modify, and self-host for personal, educational, research, or nonprofit purposes — not for
resale or commercial hosting. See [LICENSE.md](LICENSE.md) for the full text and a plain-English
summary, or open an issue if you're interested in commercial use.
