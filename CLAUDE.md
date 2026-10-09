# XIV Venue Manager — Working Conventions

Conventions for AI-assisted work on this repo. Established 2026-08-15 during the codebase-sweep project; update this file as conventions change, don't let it go stale.

## Local dev, not prod

Test everything against the local full-stack copy (`docs/LOCAL_DEV.md`) — local Postgres/Redis via `docker-compose.local.yml`, `pnpm dev` at `localhost:3000`. Never touch prod (`192.168.1.122`) as a side effect of a code change.

Pushing to `origin/main` does **not** deploy. Check `.github/workflows/` before assuming otherwise — none of the current workflows build or deploy, they only post Discord notifications, run `pnpm audit`, and smoke-check already-live prod URLs (read-only). Prod only updates via `~/bin/deploy-xiv-web.sh`, run manually over SSH.

## Shared assets

Before building a component or helper, check `docs/SHARED_ASSETS.md`. If you add something reusable, add it there in the same PR.

## Isolation

Real code changes always get their own git worktree and branch (`superpowers:using-git-worktrees`), even a one-line fix. Docs-only changes (plan docs, this file) commit directly — no worktree ceremony for something that can't break a build.

One worktree per logical change. Don't bundle an unrelated fix into an in-progress branch — start a new worktree instead, even if it means briefly overlaying another branch's file to live-test an interaction between two in-flight fixes (revert the overlay before committing).

## Planning bar

- **Multi-step, multi-file, or anything touching shared/security-relevant code** (auth, rate-limiting, payment-adjacent logic): write a full plan first (`superpowers:writing-plans`), execute via `superpowers:subagent-driven-development` — fresh subagent per task, spec-compliance review, then code-quality review, before moving to the next task.
- **Single-file, single-purpose fixes** (a bug fix confined to one component, a one-line dependency removal): implement directly, then get one independent review pass covering both spec and quality together — full two-stage ceremony is overkill for a diff a reviewer can hold in their head.
- Either way: verify with `tsc --noEmit` + `vitest run` + a live check against the running local dev server before calling something done. Static checks alone aren't enough — this project has repeatedly found real bugs (Decimal serialization, stale client state) that only a live click-through surfaced.

## Ponytail

`ponytail-review`/`ponytail-audit` (over-engineering lens) run **advisory only**. When ponytail's "cut this" collides with a correctness reviewer's "this prevents a real bug," the human decides — don't auto-resolve either direction. Established 2026-08-15 after ponytail flagged the transactions-list pagination-merge fix as unrequested complexity while the correctness review had flagged skipping it as a silent-data-loss bug; kept the fix, this is the standing precedent for that class of conflict.

## Formatting/linting

- ESLint: `eslint-config-next` (`core-web-vitals` + `typescript`) — already the standard baseline, don't add more config than that without a reason.
- TypeScript: `strict: true` in `apps/web/tsconfig.json` — keep it strict, don't loosen it to make a change easier.
- Prettier: not yet adopted as of 2026-08-15 — planned as its own increment (config + `eslint-config-prettier` + one clean formatting pass across the repo). Until that lands, match the surrounding file's existing style rather than imposing a new one.

## Comments and commits

No inline comments explaining WHAT code does — names should do that. A comment is only warranted for a non-obvious WHY (a hidden constraint, a workaround, a subtle invariant). Commit messages carry the task-specific rationale ("fixes X because Y"), not code comments — comments rot as the code evolves, commit history doesn't.
