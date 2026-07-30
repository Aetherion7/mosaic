# Publishing mosaic on GitHub — a complete walkthrough

This assumes you already have a GitHub account but haven't created a repository for mosaic yet, and
that you've never really used Git before. Every step is spelled out — skip ahead if you know a part
already.

## 0. Install Git, if you haven't

Check whether you already have it:

```bash
git --version
```

If that fails: [git-scm.com/downloads](https://git-scm.com/downloads) (Windows/macOS/Linux), then
set your identity once (used as the author on your commits):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 1. Personalize the placeholders

Every doc in this project (README, LICENSE, CONTRIBUTING, the landing page, the in-app About panel,
`package.json`) uses two placeholders instead of guessing your details:

- `YOUR_GITHUB_USERNAME` → your actual GitHub username
- `YOUR_KOFI_USERNAME` → your Ko-fi page name, once you've created one (step 6) — or delete the
  Ko-fi links if you'd rather not use it

Find every occurrence and replace it. From the project root:

```bash
grep -rl "YOUR_GITHUB_USERNAME\|YOUR_KOFI_USERNAME" \
  --include="*.md" --include="*.json" --include="*.html" --include="*.yml" --include="*.tsx" .
```

That'll list every file that needs a find-and-replace — your editor's "Find in Files" (or
`sed -i 's/YOUR_GITHUB_USERNAME/actualname/g' <file>` per file) handles it quickly. Also update the
copyright line at the top of [`LICENSE.md`](LICENSE.md) if you want your name on it instead of
"mosaic contributors".

## 2. Create the repository on GitHub

1. Go to [github.com/new](https://github.com/new).
2. Repository name: `mosaic`.
3. Visibility: **Public** (needs to be public for GitHub Pages on the free plan, and for people to
   actually see the source).
4. **Do not** check "Add a README", "Add .gitignore", or "Choose a license" — this project already
   has all three; adding them on GitHub too would just create a conflict you'd have to resolve.
5. Click **Create repository**. Leave the page open — it shows the exact commands from step 3 below.

## 3. Push the project

From the project root (the folder with `package.json` in it):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/mosaic.git
git push -u origin main
```

Refresh the GitHub page — your code is live. `.gitignore` already excludes `node_modules`,
`.next`, your local `deploy.sh`, and anything else that shouldn't be committed (see the comments in
`.gitignore` if you're curious what's excluded and why).

From now on, the normal loop is:

```bash
git add .
git commit -m "Describe what changed"
git push
```

Every push to `main` automatically runs the CI workflow (typecheck, lint, tests, build) — check the
**Actions** tab on GitHub to watch it.

## 4. Turn on GitHub Pages (the landing page)

The marketing/landing page lives at `docs/index.html` specifically so this step is one click:

1. On GitHub: **Settings → Pages**.
2. Under "Build and deployment" → Source: **Deploy from a branch**.
3. Branch: **main**, folder: **/docs**. Save.
4. After a minute or two, your page is live at `https://YOUR_GITHUB_USERNAME.github.io/mosaic/`.

GitHub Pages serves `docs/index.html` automatically — no build step, it's already a static file.
If you update the landing page later, just commit and push; Pages redeploys on its own within a
minute or two.

## 5. Add the Ko-fi button

`.github/FUNDING.yml` already references it — GitHub shows a **Sponsor** button on your repo's main
page automatically. No extra step needed there.

**Setting up Ko-fi** (takes about five minutes):

1. [ko-fi.com](https://ko-fi.com) → sign up, pick your page name (that's your `YOUR_KOFI_USERNAME`).
2. Connect PayPal or Stripe for payouts under Settings → Payments.
3. That's it — `https://ko-fi.com/your-page-name` is live immediately, no approval wait.

## 6. Build & release the desktop apps

Desktop builds are fully automated via [`.github/workflows/release.yml`](.github/workflows/release.yml)
— it builds Windows, macOS, and Linux installers in parallel and publishes them as a GitHub Release.
To ship a new version:

```bash
# bump "version" in package.json AND electron/package.json first, then:
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main --tags
```

Watch the **Actions** tab — three jobs (one per OS) run in parallel and take a few minutes each. When
they finish, check the **Releases** page: your installers are attached, and the README/landing-page
"latest release" links resolve to them automatically (they always point at whatever is newest).

**Auto-update:** every mosaic desktop install checks this same Releases feed on startup
(`electron/main.js` → `electron-updater`). Ship a new tagged release and every existing install picks
it up on its own — that's the "every update reaches everyone" behavior across Windows/macOS/Linux.

### Code signing (optional, costs money)

Without signing, Windows SmartScreen shows an "unknown publisher" warning on first launch, and
current macOS versions show **"'mosaic' is damaged and can't be opened"** instead of the older
"unidentified developer" dialog. The app still works — users just have to click through "More
info → Run anyway" (Windows) or run `xattr -cr /Applications/mosaic.app` in Terminal once (macOS;
right-click → Open no longer clears this on current macOS). To remove that warning entirely:

- **Windows**: buy a code-signing certificate (~$70–400/yr from a CA like SSL.com or DigiCert), then
  add it as the `WIN_CSC_LINK` (base64-encoded `.pfx`) and `WIN_CSC_KEY_PASSWORD` secrets in
  **Settings → Secrets and variables → Actions**.
- **macOS**: requires an Apple Developer Program membership ($99/yr), then an exported "Developer ID
  Application" certificate as `CSC_LINK`/`CSC_KEY_PASSWORD` secrets, plus notarization credentials.
  See [electron-builder's macOS signing docs](https://www.electron.build/code-signing) for the exact
  steps — this part is genuinely fiddly and not something to rush.
- **Linux**: no signing needed; AppImage/.deb don't have an equivalent warning.

This is entirely optional — plenty of small open-source desktop apps ship unsigned.

## 7. Everyday workflow, summarized

| I want to… | Do this |
|---|---|
| Ship a bug fix / feature | `git add . && git commit -m "…" && git push` — CI runs automatically |
| Update the landing page | Edit `docs/index.html`, commit, push — Pages redeploys itself |
| Release a new app version | Bump the version in both `package.json` files, tag (`git tag vX.Y.Z`), push with `--tags` |
| Accept a contribution | Review the PR (CI runs on it automatically), then merge on GitHub |

That's the whole loop — nothing here needs to be repeated per-release except the version bump + tag.
