# Atlas Flowise Upstream Policy

## Pinned upstream baseline

-   **Upstream:** https://github.com/FlowiseAI/Flowise
-   **Atlas fork:** https://github.com/avi2l/atlas-flowise
-   **Pinned release:** `flowise@2.2.7`
-   **Pinned commit:** `cf7d841f88504bba465790eb906f6d758b91ee2c`
-   **Baseline branch:** `atlas/pinned-flowise-2.2.7`
-   **Baseline protection:** no branch-protection rule as verified on 2026-08-10;
    this pin is governed by process, not a GitHub enforcement control.
-   **Pinned on:** 2026-08-03

### Main-branch containment

As observed on 2026-08-09, the repository `main` branch points to
`ba4c6509bbc481cc7f01aab3d1aa33a2aea886f1`, 769 commits beyond the pinned
baseline. Its `LICENSE.md` contains commercial-license terms and its tree
contains `packages/server/src/enterprise/`. `main` is not the Atlas line and
has not been license-reviewed. It must not be merged into or used as a base
merely after CI concerns are resolved. Its disposition requires an explicit
owner decision: reset it to the pin, retire it in favour of
`atlas/pinned-flowise-2.2.7` as the default branch, or retain it only as an
explicitly quarantined upstream mirror.

## Why this baseline

The upstream `flowise@2.2.7` release carries a plain Apache 2.0 `LICENSE.md`.
Later upstream releases include explicit commercial-license boundaries for
enterprise paths. Atlas uses this pinned release as the audited baseline rather
than following upstream `main` automatically.

## Fork policy

1. Do not merge or sync upstream automatically.
2. `main` must not be used as an Atlas merge target: it tracks Flowise `3.1.4`,
   whose license identifies a commercial-license boundary outside the pinned
   Apache-2.0 baseline. Atlas work must target the recorded pinned baseline or a
   separately approved descendant of it.
3. Evaluate upstream fixes one at a time for security, license, API compatibility,
   and Atlas product fit.
4. Keep Atlas project, actor, assignment, review, event-outbox, and governance
   records outside Flowise's database in the separate AgentFlow service.
5. Treat Flowise as an isolated workflow/canvas runtime behind Atlas-owned APIs.
6. Record every accepted upstream cherry-pick in this file with source commit,
   rationale, and license review.

## Inherited automation review gate

The pinned upstream tree includes `autoSyncSingleCommit.yml`,
`autoSyncMergedPullRequest.yml`, `docker-image.yml`, `main.yml`, and
`test_docker_build.yml`. They were inherited unchanged and were not run,
configured, or relied upon by the Atlas Phase-0 work. `main.yml` and
`test_docker_build.yml` run for pull requests only when the base branch name contains no slash (their `'*'` filter) and pushes to `main`. The auto-sync workflows
can run from a push to `main` or a merged pull request against `main`;
`docker-image.yml` can be started manually and builds the separate
`docker/Dockerfile` path. They respectively install/build/start Flowise for
Cypress and build the root container image. `test_docker_build.yml` has no
explicit permissions block and its checkout action is tag-pinned, not SHA-pinned;
do not treat its default
token posture as equivalent to the Atlas-authored boundary workflow. Do not
merge Atlas work to `main` or run the image-publishing workflow until a separate
security decision has reviewed the inherited workflows' external
repository-dispatch behavior, secrets, privileges, `pull_request_target`
trigger, untrusted pull-request metadata handling, dependency lifecycle
execution, image provenance, publishing destination, and the unpinned runtime
installation in `docker/Dockerfile`. This policy does not authorize an
automatic upstream synchronization or image publication.

## Frozen-version security review gate

The pinned release is a compatibility and license control, not a security
maintenance plan. Before any production use, Atlas must assign an owner and a
review cadence or advisory trigger for Flowise `2.2.7` and its dependencies.
Each candidate remediation remains subject to the per-change security, license,
API compatibility, and product-fit review in this policy; this does not
authorize an upstream sync, upgrade, or use of `main` as an Atlas base.

## Initial scope

The first Atlas work in this fork is limited to compatibility reconnaissance and
an integration boundary. Do not import Atlas credentials, project records, or
production data into this repository.

## Modified upstream-file inventory

Phase 0 modifies only the pinned upstream `.dockerignore`, adding exclusions for
Git metadata and the non-production Phase-0 reconnaissance/adapter artifacts.
The change keeps the root image build context from carrying the Atlas boundary;
it does not authorize building, publishing, or deploying an Atlas image. All
other Phase-0 files are newly added Atlas artifacts. This inventory is a
technical record for the Apache-2.0 modified-file notice obligation described
below and must be updated for any subsequent change to an inherited file.

## License review note

This repository is based on the Apache 2.0 release identified above. Before any
future upgrade, re-check the exact tag's `LICENSE.md`, third-party notices, and
all paths proposed for reuse. Before any redistribution of this fork or an
Atlas-built image, include a copy of the Apache-2.0 license, retain the
applicable copyright, patent, trademark, and attribution notices, and carry
prominent notices stating that modified files have been changed. Reproduce any
upstream `NOTICE` file; no upstream NOTICE file is present at `cf7d841`. This is
an engineering record, not legal advice. Apache-2.0 does not grant trademark
rights; any use of Flowise names or marks requires a separate review.

The Phase-0 `.dockerignore` intentionally keeps this inventory and other Atlas
reconnaissance artifacts out of the inherited root image build context. Before
any Atlas-built image is distributed, the deferred supply-chain decision must
provide the required Apache-2.0 modified-file notice and applicable attribution
outside that excluded context. This is not authorization to build, publish, or
deploy an image.

## Upstream remotes

```text
origin   https://github.com/avi2l/atlas-flowise.git
upstream https://github.com/FlowiseAI/Flowise.git
```
