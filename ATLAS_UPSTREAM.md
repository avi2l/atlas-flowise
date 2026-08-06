# Atlas Flowise Upstream Policy

## Pinned upstream baseline

-   **Upstream:** https://github.com/FlowiseAI/Flowise
-   **Atlas fork:** https://github.com/avi2l/atlas-flowise
-   **Pinned release:** `flowise@2.2.7`
-   **Pinned commit:** `cf7d841f88504bba465790eb906f6d758b91ee2c`
-   **Baseline branch:** `atlas/pinned-flowise-2.2.7`
-   **Pinned on:** 2026-08-03

## Why this baseline

The upstream `flowise@2.2.7` release carries a plain Apache 2.0 `LICENSE.md`.
Later upstream releases include explicit commercial-license boundaries for
enterprise paths. Atlas uses this pinned release as the audited baseline rather
than following upstream `main` automatically.

## Fork policy

1. Do not merge or sync upstream automatically.
2. Evaluate upstream fixes one at a time for security, license, API compatibility,
   and Atlas product fit.
3. Keep Atlas project, actor, assignment, review, event-outbox, and governance
   records outside Flowise's database in the separate AgentFlow service.
4. Treat Flowise as an isolated workflow/canvas runtime behind Atlas-owned APIs.
5. Record every accepted upstream cherry-pick in this file with source commit,
   rationale, and license review.

## Inherited automation review gate

The pinned upstream tree includes `autoSyncSingleCommit.yml`,
`autoSyncMergedPullRequest.yml`, and `docker-image.yml`. They were inherited
unchanged and were not run, configured, or relied upon by the Atlas Phase-0
work. They are not opt-in: a push to `main` and a merged pull request against
`main` can trigger the auto-sync workflows, while `docker-image.yml` can be
started manually and builds the separate `docker/Dockerfile` path. Do not merge
Atlas work to `main` or run the image-publishing workflow until a separate
security decision has reviewed their external repository-dispatch behavior,
secrets, privileges, `pull_request_target` trigger, untrusted pull-request
metadata handling, image provenance, publishing destination, and the unpinned
runtime installation in `docker/Dockerfile`. This policy does not authorize an
automatic upstream synchronization or image publication.

## Frozen-version security review gate

The pinned release is a compatibility and license control, not a security
maintenance plan. Before any production use, Atlas must assign an owner and a
review cadence or advisory trigger for Flowise `2.2.7` and its dependencies.
Each candidate remediation remains subject to the per-change security, license,
API compatibility, and product-fit review in this policy; this does not
authorize an upstream sync or upgrade.

## Initial scope

The first Atlas work in this fork is limited to compatibility reconnaissance and
an integration boundary. Do not import Atlas credentials, project records, or
production data into this repository.

## License review note

This repository is based on the Apache 2.0 release identified above. Before any
future upgrade, re-check the exact tag's `LICENSE.md`, third-party notices, and
all paths proposed for reuse. This is an engineering record, not legal advice.

## Upstream remotes

```text
origin   https://github.com/avi2l/atlas-flowise.git
upstream https://github.com/FlowiseAI/Flowise.git
```
