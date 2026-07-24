# Contributing to mosaic

Thanks for taking the time to contribute! This doc covers what you need to know before opening an
issue or a pull request. If anything here is unclear, open an issue and ask — that's a valid
contribution too.

## Before you start

mosaic is source-available under the
**[PolyForm Noncommercial License 1.0.0](LICENSE.md)**, not a permissive open-source license. In
short: free for personal/nonprofit use and modification, not for commercial resale or hosting. By
submitting a contribution (issue, pull request, or otherwise), **you agree that your contribution is
licensed under the same terms as the rest of the project.** If that's not something you're
comfortable with, please don't open a PR — bug reports and discussion are always welcome regardless.

## Reporting bugs

Open an [issue](https://github.com/Aetherion7/mosaic/issues/new) with:

- What you did, what you expected, what happened instead
- Your OS/browser (or desktop app version, if applicable)
- Steps to reproduce, if you can find a reliable one
- Console errors, if any (DevTools → Console)

Since mosaic stores everything locally, screenshots or a short screen recording are usually more
useful than a data export.

## Suggesting features

Open an issue describing the problem you're trying to solve, not just the feature — it's easier to
find the right design for "I keep losing track of X" than to evaluate a fully-specified feature in
isolation. Check existing issues first to avoid duplicates.

## Working on the code

### Project structure

Read **[KONZEPT.md](KONZEPT.md)** first — it's the single source of truth for the app's
architecture, the widget system, the design language, and date-handling rules. In particular, if
you're adding a new widget type, follow the registration checklist in KONZEPT.md §5.2 exactly —
widgets need to be wired into several places (type picker, settings catalog, board store defaults,
i18n) and it's easy to miss one.

### Setup

```bash
git clone https://github.com/Aetherion7/mosaic.git
cd mosaic
npm install
npm run dev
```

### Before opening a PR

```bash
npx tsc --noEmit   # typecheck
npm run lint       # eslint
npm test           # vitest unit tests
npm run build      # confirm the production build still succeeds
```

All four should pass cleanly. If you touched UI you can actually click through, a quick manual pass
in the browser is worth more than any of the above — this is a visual, interaction-heavy app.

### Conventions

- **Bilingual UI, no exceptions.** Every new user-facing string goes through `t('English text')`,
  with the English string as the key and a German translation added to `src/lib/i18n.ts`. English is
  the default/source language — never leave a string hardcoded in only one language, and never leave
  a key without its DE translation.
- **TypeScript strictness.** No `any` unless there's genuinely no better option; prefer narrowing
  over casting.
- **Match the surrounding code.** Comments explain *why*, not *what* — the code should already say
  what it does. Match the existing formatting, naming, and comment density in whatever file you're
  editing rather than importing a different style.
- **Security-sensitive code** (anything touching `localStorage`/IndexedDB import-export, formula
  evaluation, iframe embeds, or the AI tool-calling layer) gets extra scrutiny — please explain your
  reasoning in the PR description, not just the diff.

### Commit messages & PRs

- Keep PRs focused — one fix or feature per PR is much easier to review than a bundle.
- Explain *why* in the PR description, not just *what* changed; the diff already shows the what.
- Reference the issue you're addressing, if there is one.

## Code of conduct

Be respectful. Disagreement about code and design is normal and welcome; personal attacks aren't.
Maintainers may close issues/PRs or block users who don't engage in good faith.
