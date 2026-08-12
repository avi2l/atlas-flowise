# Atlas / Flowise AgentFlow — Phase 0 reconnaissance and boundary

**Status:** reconnaissance complete; adapter remains deliberately disabled.
**Scope:** Flowise `2.2.7`, pinned at `cf7d841f88504bba465790eb906f6d758b91ee2c`.
Every Flowise behavior and authentication finding below applies only to that
pinned tree, not to the separate `main` line.
No upstream synchronization, package upgrade, external deployment, credential
import, production-data access, database change, or identity/security architecture
change was performed. Inherited repository CI can start local Flowise and Docker
build jobs without Atlas credentials or production data; this work did not add,
run, or configure those jobs.

This document records engineering observations, not an authorization to connect
Atlas to Flowise.

## Main-branch containment

As observed on 2026-08-09, the repository `main` branch points to
`ba4c6509bbc481cc7f01aab3d1aa33a2aea886f1`, 769 commits beyond this document's
pinned baseline. Its `LICENSE.md` contains commercial-license terms and its
tree contains `packages/server/src/enterprise/`. `main` is not the Atlas line
and has not been license-reviewed. It must not be merged into or used as a base
merely after CI concerns are resolved. Its disposition requires an explicit
owner decision: reset it to the pin, retire it in favour of
`atlas/pinned-flowise-2.2.7` as the default branch, or retain it only as an
explicitly quarantined upstream mirror. The inherited-workflow and telemetry
gates below are additional constraints, not a path to make `main` approved.

## Compatibility findings

| Area                       | Observation in the pinned tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Integration consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AgentFlow model            | `packages/server/src/utils/buildChatflow.ts` uses `MULTIAGENT` for one AgentFlow classification path, while execution can also select `buildAgentGraph.ts` from ending-node categories.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Atlas must treat the pinned runtime as an isolated workflow/canvas engine, not as the system of record. A future allow-list or routing rule cannot rely on the chatflow type alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| AgentFlow discovery and UI | `packages/server/src/services/chatflows/index.ts` and `packages/ui/src/api/chatflows.js` query `MULTIAGENT`; Flowise exposes its own `/agentflows` UI in `packages/ui/src/views/agentflows/index.jsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The Flowise UI has no Atlas context. Do not embed or expose it as an Atlas endpoint in Phase 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Runtime authentication     | `packages/server/src/index.ts` enables one global Basic Auth user only when both `FLOWISE_USERNAME` and `FLOWISE_PASSWORD` are configured. A client-settable `x-request-from: internal` header bypasses API-key validation when Basic Auth is absent; with Basic Auth configured, it selects Basic Auth instead. `WHITELIST_URLS` contains 20 unauthenticated `/api/v1` prefixes (including public flow/config, prediction, uploads, feedback, leads, and metrics), matched with `req.path.startsWith`; that whitelist bypass is unconditional in both Basic-Auth branches. All non-`/api/v1` paths (including the UI and canvas) also bypass this middleware. When `MODE=queue`, `/admin/queues` mounts Bull Board without an authentication wrapper, exposing queue administration outside this middleware. `CORS_ORIGINS` and `IFRAME_ORIGINS` both default to `*`. | Flowise does not provide Atlas actor, tenant, project, or authorization enforcement. Basic Auth does not protect the whitelisted routes. The contained deployment boundary and Atlas-owned authorization layer are mandatory; Flowise must never be directly exposed to Atlas clients. A future private ingress must strip client-supplied `x-request-from`, deny direct public/UI and `/admin/queues` access, restrict browser origins and framing rather than relying on the `*` defaults, normalize or reject traversal and encoded path forms before applying any allow-list, and explicitly handle the complete prefix allow-list.                                                                                                                                                                                                                      |
| Execution data             | `buildChatflow.ts` creates/stores chat messages and sends AgentFlow telemetry. Flowise telemetry is enabled unless `DISABLE_FLOWISE_TELEMETRY=true`. The pinned tool catalog includes custom tools, code-interpreter, filesystem, HTTP, and MCP capabilities. The inherited `main.yml` starts Flowise for Cypress without setting `DISABLE_FLOWISE_TELEMETRY`; `main.yml` and `test_docker_build.yml` run for pull requests only when the base branch name contains no slash (their `'*'` filter) and pushes to `main`.                                                                                                                                                                                                                                                                                                                                                | Atlas project, actor, assignment, review, governance, and event-outbox records must remain outside Flowise, as required by `ATLAS_UPSTREAM.md`. No Flowise instance or adapter transport runtime was started locally for this Phase-0 work; the disabled module is exercised only in-process by its contract test. A PR targeting the slash-containing pinned baseline does not match those inherited PR triggers; a PR targeting an un-slashed branch, or pushing/merging to `main`, would start the inherited localhost Flowise process (and the inherited Docker build) without Atlas credentials or production data, but with Flowise's default telemetry posture. Changing that inherited CI behavior is a separate GitHub Actions and telemetry security decision; do not target an un-slashed branch or merge this branch to `main` until it is made. |
| Container packaging        | The root `Dockerfile` builds this pinned source tree and excludes `atlas/` through `.dockerignore`. Separately, inherited `docker/Dockerfile` installs unversioned latest `flowise` from npm and the inherited `docker-image.yml` can publish that image to the upstream `flowiseai/flowise` namespace. The inherited `docker/docker-compose.yml` and `docker/worker/docker-compose.yml` use `flowiseai/*:latest`, publish the configured port to the host, and bind-mount `~/.flowise`; `docker/README.md` presents `docker compose up -d` and `http://localhost:3000` before its optional Basic Auth instructions.                                                                                                                                                                                                                                                   | The inherited Dockerfiles and compose examples are not evidence of the audited `2.2.7`/`cf7d841` runtime and are not authorized for Atlas use. Selecting, pinning, publishing, or deploying any Atlas runtime image requires a separate supply-chain and deployment-containment decision; this Phase-0 work did not run or change those paths. In particular, do not use the compose examples for an Atlas environment: their host exposure, unpinned images, persistence mount, and optional-auth posture violate the required contained runtime boundary.                                                                                                                                                                                                                                                                                                  |
| Example content            | `packages/server/marketplaces/agentflows/` contains example flow JSON.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Examples are reconnaissance material only; no marketplace flow or production data is imported into the adapter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| License/pin                | `ATLAS_UPSTREAM.md` records Apache 2.0 for this exact release and forbids automatic upstream sync.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Any future upstream change requires the recorded per-change license/security/API review; no later enterprise/commercial code may be copied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Service boundary

```text
Atlas-owned clients
        |
        |  (future Atlas-owned API; not implemented here)
        v
Separate Atlas AgentFlow service
  - owns Atlas actor/project/assignment/review/governance/outbox state
  - enforces Atlas authentication, authorization, tenant and project isolation
  - owns audit, retention, redaction, and operator controls
        |
        |  (future contained transport; security design required)
        v
Isolated pinned Flowise 2.2.7 runtime
  - owns only workflow/canvas execution concerns
  - is not directly exposed to Atlas clients
  - does not become an Atlas identity or authorization authority
```

In its default posture, the pinned release is effectively unauthenticated for
Atlas purposes: a client-controlled header bypasses its API-key middleware, the
20 whitelisted prefixes bypass it whether or not Basic Auth is configured, and
the UI/canvas and queue administration sit outside that middleware. Network
containment alone is insufficient where a browser or other untrusted client can
reach the instance, especially given the permissive browser defaults and
state-changing unauthenticated routes. An approved private ingress and
Atlas-owned authorization layer are required; Flowise authentication is never
an Atlas security control.

### Ownership invariants

1. Flowise is never directly exposed to Atlas clients.
2. Atlas identity, authentication, authorization, permissions, tenants,
   projects, assignments, reviews, governance, and event-outbox data do not
   enter Flowise's database.
3. Atlas owns the external run lifecycle and audit record; Flowise is an
   isolated runtime dependency only.
4. A Flowise execution identifier is an opaque runtime reference, not an Atlas
   actor, project, permission, or authorization claim; it is also sensitive
   capability data and must not be exposed, logged, or accepted as client-run
   scope.
5. Flowise responses, tool results, streamed chunks, artifact references, and
   errors are untrusted input at the Atlas boundary. They must be validated and
   bounded by Atlas and cannot become trusted markup, domain records, or
   authorization decisions.
6. Flowise's default-open execution and instance-wide administrative state are
   never Atlas authorization controls. A Flowise canvas change that clears a
   flow API-key binding or marks a flow public is an authorization-sensitive
   change and cannot make an Atlas flow executable or visible.
7. The disabled local skeleton has no execution, I/O, configuration, or secret
   loading behavior. The Phase-0 `atlas/` directory is closed to the adapter
   skeleton, and its source-level static tripwire and closed directory
   allow-list are regression guards, not an adversarial-edit control or a
   complete proof against indirect JavaScript runtime capabilities.
8. Flowise persistent state, uploads, and backups are separate contained data
   paths. They must not be co-located with or share credentials with any Atlas
   datastore.
9. Atlas terminates and re-authors every request at its boundary. It never acts
   as a pass-through proxy for caller-supplied Flowise headers, `chatId`,
   `overrideConfig`, node inputs, credential references, uploads, or responses.

## Unauthenticated-prefix reconnaissance

In the pinned release, `WHITELIST_URLS` is checked with `req.path.startsWith`.
The following are the complete 20 unauthenticated `/api/v1` prefixes recorded
from `packages/server/src/utils/constants.ts`. They are a subset of the broader
internal-header exposure described below, not an allow-list for a future Atlas
ingress:

```text
/api/v1/verify/apikey/                 /api/v1/chatflows/apikey/
/api/v1/public-chatflows                /api/v1/public-chatbotConfig
/api/v1/prediction/                     /api/v1/vector/upsert/
/api/v1/node-icon/                      /api/v1/components-credentials-icon/
/api/v1/chatflows-streaming             /api/v1/chatflows-uploads
/api/v1/openai-assistants-file/download /api/v1/feedback
/api/v1/leads                           /api/v1/get-upload-file
/api/v1/ip                              /api/v1/ping
/api/v1/version                         /api/v1/attachments
/api/v1/metrics                         /api/v1/nvidia-nim
```

In particular, this includes unauthenticated vector-store write
(`vector/upsert`), which is a prompt-injection ingress risk when a flow later
retrieves that store; file egress (`get-upload-file` and
`openai-assistants-file/download`); and unauthenticated lead reads that can
return captured PII (`leads`). Unauthenticated `/api/v1/nvidia-nim` is a host
installer and container control risk: its routes can download/run the NVIDIA
installer and accept caller-controlled image tags for image pull and container
start operations. Its token-mint route also makes an outbound NVIDIA request.
The containment decision is deferred: Phase 0 neither enables these routes nor
authorizes a Flowise runtime with Docker socket, host-runtime, or installer
control. Entries without a trailing slash are still prefixes, not exact-route
matches. Any future private ingress must deny public access and make an
explicit, version-specific decision for every path; this record does not
authorize any of them.

## Execution, instance-export, and end-user UX boundaries

The whitelisted `/api/v1/prediction/` route is not a safe authorization boundary:
Flowise accepts execution when a chatflow has no bound API key, and its fallback
browser-origin check is not Atlas server-side authorization. Similarly, a
Flowise canvas user can mark a chatflow public. Atlas must deny direct access to
these endpoints and independently authorize every flow invocation; Flowise
`apikeyid`, `isPublic`, chat ID, and allowed-origin fields are untrusted runtime
configuration, not Atlas claims.

`/api/v1/export-import` is not whitelisted, but it is not reliably API-key
gated in the default posture: when Basic Auth is absent, a client-settable
`x-request-from: internal` header reaches this endpoint without an API key. If
an API key is evaluated, it is instance-global and can read or write the
instance's flows, agentflows, tools, variables, and assistants. A future
contained transport must not expose this endpoint or grant an instance
credential based on Atlas tenant or project access. It is an
instance-administration and data-egress boundary, not a tenant-safe integration
API.

This header bypass applies to the entire non-whitelisted `/api/v1` surface, not
only the routes named here. For example, `GET /api/v1/credentials/:id` returns a
decrypted `plainDataObj`. Credential, variable, and API-key administration are
therefore maximal exposure cases, not tenant-safe integration APIs.

The same header reaches non-whitelisted internal execution paths when Basic Auth
is absent. `/api/v1/internal-prediction` invokes Flowise's internal build path,
which bypasses the per-flow API-key and allowed-origin checks; its streaming
path also accepts a supplied `chatId` before validation. `/api/v1/vector/internal-upsert/:id`
uses the corresponding internal vector-upsert path. These routes are not
tenant-safe alternatives to the public routes, and a bound Flowise flow API key
or allowed origin is not a defense against them. A future private ingress must
strip client-supplied `x-request-from` and deny direct access to both internal
and public Flowise execution routes; no transport is authorized by this record.
`internal-prediction` and `internal-upsert` also do not apply Flowise's external
rate-limit middleware, so Atlas and private ingress must own rate limiting.

Flowise's end-user **Flowise embed** widget is also out of scope. Its generated
snippet loads an unpinned third-party CDN asset and uses Flowise public-chatflow
and chatbot-config routes. Atlas requires an Atlas-owned end-user experience;
do not embed the Flowise widget, iframe, canvas, or public chatbot routes in an
Atlas product without a separate approved UX, supply-chain, and authorization
design.

## Additional compatibility boundaries

### SSE `chatId` is a runtime capability

Flowise's `SSEStreamer` keeps live output streams in an instance-wide map keyed
by client-supplied `chatId`. The prediction controller registers that stream
before the later flow API-key validation path. Consequently, inside Flowise a
`chatId` is a capability that selects a live output sink; it is not merely an
opaque conversational label. A caller that can choose another live `chatId`
can disrupt or receive that stream before its own request is rejected.

Phase 0 does not authorize SSE transport. Any future Atlas boundary must not
pass a caller-controlled `chatId` through to Flowise. If a Flowise `chatId` is
ever required, it must be Atlas-minted, unguessable, isolated from other trust
domains, and treated as sensitive runtime capability data. This exposure is an
additional reason that shared-instance and tenancy decisions remain a hard
stop gate.

### Flowise API keys are instance-global

The pinned release validates a bare key against the Flowise instance; every
valid Flowise API key can access every non-whitelisted API route. A key is not
scoped to a flow, tenant, or route. In particular, a future Atlas credential
exchange cannot obtain a natively Flowise-scoped credential from this release.
That constraint must be resolved by the separate Atlas authorization and
deployment-containment design, not by passing an Atlas credential to Flowise.

### Canonical paths are required before Flowise authorization

Before its authorization middleware, Flowise's `sanitizeMiddleware` rewrites
`req.url` with `sanitizeHtml(decodeURI(req.url))`. Its prefix-based route
decisions therefore operate on a transformed URL, not necessarily the original
wire path. Private ingress must reject any path that is not already canonical
before its own route policy or allow-list is evaluated; normalization alone is
not sufficient. This work does not authorize changing Flowise's middleware or
relying on it as an ingress control.

## Repository-automation reconnaissance

As observed on 2026-08-06, `avi2l/atlas-flowise` has no repository Actions
secrets configured. This means no repository-scoped secrets were configured at
the time of this check. This finding does not establish the absence of
organization-level or environment-level secrets. As verified on 2026-08-10,
neither `main` nor `atlas/pinned-flowise-2.2.7` has a branch-protection rule.
The lack of branch protection leaves their triggers and the pinned-baseline
containment controls governed only by process.
`autoSyncSingleCommit.yml` and `autoSyncMergedPullRequest.yml` dispatch commit
or pull-request metadata to the repository named by `AUTOSYNC_CH_URL` when
`AUTOSYNC_*` secrets are later added; the latter also uses
`pull_request_target` and `contents: write`. This is an outbound metadata and
privilege boundary, not an Atlas-approved upstream-update mechanism. This is
not an approval to add secrets, change protection, merge to `main`, or run
those workflows. A designated Atlas security/repository owner must make and
record the enforcement decision before any merge to `main`.

## Phase-0 adapter contract

`atlas/agentflow-adapter/adapter.js` is intentionally plain CommonJS and sits
outside the pnpm workspace and Flowise build graph. Root lint tooling can still
glob this directory, so the adapter follows repository formatting conventions.
Its only behavior is fail-closed:

-   `enabled` is always `false`.
-   `run()` rejects without inspecting caller arguments.
-   `abort()` rejects without inspecting caller arguments.
-   The rejected error has code `ATLAS_AGENTFLOW_ADAPTER_DISABLED`.
-   The rejected error identifies only the attempted operation (`run` or
    `abort`); it carries no request data.

No request shape is accepted. It defines no Atlas credential, actor, permission,
data, or transport protocol. `run` and `abort` are placeholder tripwire names,
not approved lifecycle semantics; they are equally subject to the stop gates,
including authorization and cancellation decisions. The closed surface is a
deliberate tripwire, not a production lifecycle contract: any additional verb
requires all applicable stop-gate decisions and an explicit contract-test
change; at minimum gates 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
16, 17, and 18 apply to a lifecycle verb.

## Security-sensitive decisions deferred (stop gates)

Do **not** implement a transport until Atlas approves all of the following:

1. The service-to-service authentication and credential-exchange design.
2. Authorization, tenant/project isolation, and Flowise workflow ownership
   checks for create/read/run/abort operations. This includes Atlas-owned,
   server-minted run and session references; a Flowise `chatId` or session ID
   supplied by a client cannot be trusted or forwarded as an Atlas run scope.
3. Deployment containment: private network boundary, ingress policy, and
   operational ownership of the isolated Flowise runtime. The ingress must
   terminate and re-mint all client-supplied authentication and identity headers
   (`Authorization`, `x-request-from`, and cookies), and forward only an
   Atlas-generated allow-list of headers to Flowise. It must deny public/UI and `/admin/queues` access, normalize
   or reject traversal and encoded path forms before applying
   any allow-list, and explicitly handle the complete Flowise prefix allow-list
   before any transport exists.
4. Run lifecycle semantics, especially cancellation and human-in-the-loop
   continuation, plus durable Atlas audit/event ownership.
5. The permitted Flowise node/tool catalog, sandboxing, default-deny egress and
   SSRF controls, filesystem policy, and MCP connectivity. Egress must not
   reach Atlas services, Atlas datastores, queue stores, or instance-metadata
   endpoints. No custom code, filesystem, HTTP, code-interpreter, or MCP
   capability may be enabled by implication of the transport.
6. The trust model for model-directed tool invocation: which capabilities may be
   selected from model output versus only Atlas-supplied configuration, which
   content is untrusted, and which per-run capability scopes or human approvals
   bound prompt-injection impact. The design must assume injection succeeds and
   limit capability blast radius rather than relying on prompts.
7. Ownership, provisioning, rotation, storage, and recovery of Flowise runtime
   credentials and encryption material, including `FLOWISE_SECRETKEY_OVERWRITE`,
   `SECRETKEY_PATH`, and Flowise's credential store. Phase 0 does not authorize
   putting Atlas or third-party production secrets in Flowise.
8. Data classification, redaction, retention, erasure, and approved handling of
   inputs, outputs, uploads, traces, telemetry, and logs, including Flowise's
   default-on telemetry posture and its `DISABLE_FLOWISE_TELEMETRY` control.
   The decision must assign responsibility for deletion and verify erasure from
   Flowise-held state, backups, and any queue-mode copies.
9. A version-specific, allow-listed input contract that rejects Flowise
   `overrideConfig`, node-input, variable, credential-reference, and upload
   overrides unless Atlas explicitly authorizes each capability.
10. Ownership and cadence or advisory triggers for security review of the frozen
    Flowise `2.2.7` release and its dependencies, without permitting automatic
    upstream synchronization.
11. Whether a shared Flowise instance is permitted or whether an instance must
    be isolated per tenant or trust domain. The decision must account for
    Flowise-internal chatflow definitions, credential store, uploads, chat
    messages, and tool reachability; Atlas-layer authorization alone does not
    partition that state.
12. Resource exhaustion and cost controls owned by Atlas and private ingress:
    concurrency, execution timeouts, rate limits, payload and upload limits,
    and model-spend bounds.
13. Whether queue mode is enabled. If it is, Redis or any equivalent queue/data
    store is an additional contained data path subject to the same retention,
    redaction, access-control, and operational-ownership decisions; Bull Board
    at `/admin/queues` must not be exposed to Atlas clients.
14. Operator access and flow-definition change control: who can access the
    Flowise canvas or its administrative APIs, how workflow changes are approved
    and audited, and how that control preserves tenant/trust-domain isolation.
15. Flowise persistent-state placement and ownership: the database, upload/file
    storage, backups, encryption at rest, access paths, and credentials must be
    separately owned and contained. They must not be co-located with or share
    credentials with any Atlas datastore.
16. The Atlas end-user output contract: Flowise-produced artifacts require an
    isolated or sandboxed serving origin, or forced download with explicit
    content type and disposition. Model-authored content and links require an
    allow-listed rendering policy, and there must be no verbatim relay of
    Flowise errors to end users.
17. Runtime operational ownership: monitoring, alerting, incident response, and
    on-call ownership for the contained Flowise dependency and its ingress must
    be assigned. The Atlas boundary must also define outage behavior,
    idempotency, and duplicate-execution handling before it submits a run.
18. Host-runtime privilege posture: Atlas must decide and document a
    default-deny posture: Flowise must not receive a Docker daemon socket,
    host-runtime control, or installer privileges. Any exception requires a
    separately documented Atlas security decision and deployment-containment
    review; the presence of a Flowise route is not an authorization to grant it.

These are architecture decisions with security impact. Their absence is why
this Phase-0 adapter stays disabled. The inherited repository-dispatch and
image-publishing workflows are also deferred for a separate GitHub Actions and
supply-chain security review; the auto-sync workflows can be triggered by
merging work to `main`, while `docker-image.yml` can manually build the
unaudited `docker/Dockerfile` path and publish an image. This branch must not
be merged to `main`, and the image-publishing workflow must not be run, until
those decisions are recorded. In particular, `autoSyncMergedPullRequest.yml`
uses `pull_request_target`, an external token, and raw PR-title interpolation
in JSON payload construction. This work neither runs nor configures them.

## Verification

The adapter was developed test-first using Node's built-in test runner. The
initial test failed because `./adapter` did not exist; after the minimal
fail-closed implementation, the contract test passed:

```text
node --test atlas/agentflow-adapter/adapter.test.js
# all adapter contract tests pass
```

The standalone `Atlas AgentFlow Adapter Boundary` workflow is constrained by
this contract test to its single Node 20 contract step, without installing or
starting Flowise. It runs for pushes to the slash-containing pinned baseline
(`atlas/pinned-flowise-2.2.7`) and for pull requests targeting any base branch;
the latter coverage provides the same containment check when a proposed branch
is incorrectly targeted at an un-slashed base. This is a
regression check, not an enforcement boundary against an adversarial edit: the
workflow and its test execute from the proposed revision, and the pinned
baseline has no branch-protection rule. Do not target an un-slashed base or merge
this branch to `main`, because either path can start inherited Flowise work with
its default telemetry posture until the separate CI and telemetry security
decision is recorded. The contract also regression-checks the root
container-build exclusion for `atlas/`. The separate inherited `docker/Dockerfile`
is built with the repository context, which is also subject to `.dockerignore`,
but it does not copy repository files into its image. The inherited standard
Flowise CI workflow was intentionally left unchanged to avoid coupling this
isolated check to a full Flowise dependency installation. The root build's
`atlas/` exclusion is a regression-checked build-context separation, not a
guarantee against a future Dockerfile or ignore-rule change.

The repository-wide Flowise build was not treated as a release signal in this
Phase-0 change: the local environment has Node `24.14.0`, while the pinned
repository declares Node `>=18.15.0 <19.0.0 || ^20`, and pnpm 11's install
policy rejects unapproved native build scripts. No dependency, lockfile, or
upstream change was retained.
