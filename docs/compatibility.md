# Compatibility & Dependency Canary

`dsh-webstack` is a plugin for the DeepSeek Harness, so it must keep working as
`@deepseek-ai/dsh-web` (and its `cordis` / `schemastery` dependencies) evolve.
Rather than pinning, the repo **declares a supported range and continuously proves it**.

## How it works

| Layer | What | When |
|---|---|---|
| **Peer range** | `peerDependencies["@deepseek-ai/dsh-web"]` in `package.json` is the support statement. | Edited by hand when a release is verified. |
| **Offline contract tests** | `pnpm run test:compat` — typecheck, build and `test/compat.test.ts` (plus the unit/security suites). No network, SearXNG or Python needed, so a failure always means a real incompatibility. | Every PR / push, and the canary. |
| **CI matrix** (`ci.yml`) | Runs the gate against the lockfile and against the **oldest and newest version inside the peer range**. Blocks merges. | PRs, pushes to `main`. |
| **Canary** (`canary.yml`) | Runs the same gate daily against versions *beyond* the range: dist-tags `next` / `alpha` and the newest release of every minor series. | Daily 05:23 UTC, manually, or `repository_dispatch: dsh-release`. |
| **Live smoke** (`ci.yml` → `smoke`) | Real SearXNG container + Scrapling + public internet. Non-blocking: third parties flake. | PRs, pushes. |
| **Dependabot** | Weekly PRs for `@deepseek-ai/*` (grouped) and monthly for GitHub Actions. Each PR is tested by the matrix. | Weekly / monthly. |

The set of versions tested is **derived from `package.json`** by
`.github/scripts/resolve-matrix.mjs`, so widening the peer range automatically
widens what CI verifies.

## Getting notified

* A failing canary leg opens (or updates) a GitHub issue labelled `dsh-compat`,
  titled `Compat canary failing: @deepseek-ai/dsh-web [<leg>]`. Issues close
  themselves when the leg passes again. Make sure you are **Watching** the repo
  (*Watch → Custom → Issues*) and have GitHub notifications on mobile/email.
* Optional push channel: add a repository secret `NOTIFY_WEBHOOK_URL` containing
  a Slack or Discord incoming-webhook URL. Failing legs post a one-line message.

## When the canary goes red

1. Open the linked run; the step summary lists the resolved
   `dsh-web` / `schemastery` / `cordis` versions.
2. Reproduce locally:
   ```sh
   pnpm add -D --save-exact @deepseek-ai/dsh-web@<version>
   pnpm run typecheck && pnpm run test:compat
   ```
3. Fix the plugin. A common cause is `@deepseek-ai/schemastery` drifting: dsh-web
   depends on a specific `schemastery`, and two copies yield incompatible
   `Schema` types. Keep this package's `schemastery` range aligned with what the
   newest supported dsh-web declares.
4. Once green, widen `peerDependencies` if the version is outside the range, bump
   the version, and release.

When a leg for a version *beyond* the range is **green**, the range is merely
out of date — widen it and cut a release so users stop seeing peer warnings.

## Maintainer checklist

* In **Settings → Branches**, require the `ci` workflow's *Lockfile as committed* and
  *Supported range* checks on `main` (pick them from the status-check list after the
  first run). Do **not** require `smoke`.
* GitHub disables scheduled workflows after 60 days without repository activity
  (it emails you). If that happens, re-enable `canary` under the Actions tab.
* Never require the live smoke job for releases; use the offline gate.
