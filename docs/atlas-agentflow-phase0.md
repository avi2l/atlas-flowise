# Atlas / Flowise AgentFlow — Phase 0 reconnaissance and boundary

**Status:** reconnaissance complete; adapter remains deliberately disabled.
**Scope:** Flowise `2.2.7`, pinned at `cf7d841f88504bba465790eb906f6d758b91ee2c`.
No upstream synchronization, package upgrade, external deployment, credential
import, production-data access, database change, or identity/security architecture
change was performed. Inherited repository CI can start local Flowise and Docker
build jobs without Atlas credentials or production data; this work did not add,
run, or configure those jobs.

This document records engineering observations, not an authorization to connect
Atlas to Flowise.

## Compatibility findings

| Area                       | Observation in the pinned tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Integration consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AgentFlow model            | `packages/server/src/utils/buildChatflow.ts` uses `MULTIAGENT` for one AgentFlow classification path, while execution can also select `buildAgentGraph.ts` from ending-node categories.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Atlas must treat the pinned runtime as an isolated workflow/canvas engine, not as the system of record. A future allow-list or routing rule cannot rely on the chatflow type alone.                                                                                                                                                                                                                                                                                                                                                              |
| AgentFlow discovery and UI | `packages/server/src/services/chatflows/index.ts` and `packages/ui/src/api/chatflows.js` query `MULTIAGENT`; Flowise exposes its own `/agentflows` UI in `packages/ui/src/views/agentflows/index.jsx`.                                                                                                                                                                                                                                                                                                                                                                                                                                              | The Flowise UI has no Atlas context. Do not embed or expose it as an Atlas endpoint in Phase 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Runtime authentication     | `packages/server/src/index.ts` enables one global Basic Auth user only when both `FLOWISE_USERNAME` and `FLOWISE_PASSWORD` are configured. A client-settable `x-request-from: internal` header bypasses API-key validation when Basic Auth is absent; with Basic Auth configured, it selects Basic Auth instead. `WHITELIST_URLS` contains 20 unauthenticated `/api/v1` prefixes (including public flow/config, prediction, uploads, feedback, leads, and metrics), matched with `req.path.startsWith`; all non-`/api/v1` paths (including the UI and canvas) also bypass this middleware. `CORS_ORIGINS` and `IFRAME_ORIGINS` both default to `*`. | Flowise does not provide Atlas actor, tenant, project, or authorization enforcement. The contained deployment boundary and Atlas-owned authorization layer are mandatory; Flowise must never be directly exposed to Atlas clients. A future private ingress must strip client-supplied `x-request-from`, deny direct public/UI access, restrict browser origins and framing rather than relying on the `*` defaults, and explicitly handle the complete prefix allow-list.                                                                       |
| Execution data             | `buildChatflow.ts` creates/stores chat messages and sends AgentFlow telemetry. Flowise telemetry is enabled unless `DISABLE_FLOWISE_TELEMETRY=true`. The pinned tool catalog includes custom tools, code-interpreter, filesystem, HTTP, and MCP capabilities.                                                                                                                                                                                                                                                                                                                                                                                       | Atlas project, actor, assignment, review, governance, and event-outbox records must remain outside Flowise, as required by `ATLAS_UPSTREAM.md`. No Flowise instance or adapter transport runtime was started locally for this Phase-0 work; the disabled module is exercised only in-process by its contract test. Inherited PR CI does start a localhost Flowise process and Docker build without Atlas credentials or production data; telemetry handling, node/tool allow-listing, egress, and sandboxing are explicit future security gates. |
| Container packaging        | The root `Dockerfile` builds this pinned source tree and excludes `atlas/` through `.dockerignore`. Separately, inherited `docker/Dockerfile` installs unversioned latest `flowise` from npm and the inherited `docker-image.yml` can publish that image to the upstream `flowiseai/flowise` namespace.                                                                                                                                                                                                                                                                                                                                             | The inherited `docker/Dockerfile` is not evidence of the audited `2.2.7`/`cf7d841` runtime and is not authorized for Atlas use. Selecting, pinning, publishing, or deploying any Atlas runtime image requires a separate supply-chain and deployment-containment decision; this Phase-0 work did not run or change that path.                                                                                                                                                                                                                    |
| Example content            | `packages/server/marketplaces/agentflows/` contains example flow JSON.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Examples are reconnaissance material only; no marketplace flow or production data is imported into the adapter.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| License/pin                | `ATLAS_UPSTREAM.md` records Apache 2.0 for this exact release and forbids automatic upstream sync.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Any future upstream change requires the recorded per-change license/security/API review; no later enterprise/commercial code may be copied.                                                                                                                                                                                                                                                                                                                                                                                                      |

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

### Ownership invariants

1. Flowise is never directly exposed to Atlas clients.
2. Atlas identity, authentication, authorization, permissions, tenants,
   projects, assignments, reviews, governance, and event-outbox data do not
   enter Flowise's database.
3. Atlas owns the external run lifecycle and audit record; Flowise is an
   isolated runtime dependency only.
4. A Flowise execution identifier is an opaque runtime reference, not an Atlas
   actor, project, permission, or authorization claim.
5. Flowise responses, tool results, streamed chunks, artifact references, and
   errors are untrusted input at the Atlas boundary. They must be validated and
   bounded by Atlas and cannot become trusted markup, domain records, or
   authorization decisions.
6. The disabled local skeleton has no execution, I/O, configuration, or secret
   loading behavior. Its source-level static tripwire and closed directory
   allow-list are regression guards, not an adversarial-edit control or a
   complete proof against indirect JavaScript runtime capabilities.

## Unauthenticated-prefix reconnaissance

In the pinned release, `WHITELIST_URLS` is checked with `req.path.startsWith`.
The following are the complete 20 unauthenticated `/api/v1` prefixes recorded
from `packages/server/src/utils/constants.ts`; they are not an allow-list for a
future Atlas ingress:

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

In particular, this includes vector-store write (`vector/upsert`) and file
egress (`get-upload-file` and `openai-assistants-file/download`) paths. Entries
without a trailing slash are still prefixes, not exact-route matches. Any future
private ingress must deny public access and make an explicit, version-specific
decision for every path; this record does not authorize any of them.

## Repository-automation reconnaissance

As observed on 2026-08-06, `avi2l/atlas-flowise` has no repository Actions
secrets configured and its `main` branch has no branch-protection rule. This
means the inherited auto-sync and image-publish workflows were not armed with
repository secrets at the time of this check, but the lack of branch protection
leaves their `main` triggers governed only by process. This is not an approval
to add secrets, change protection, merge to `main`, or run those workflows. A
designated Atlas security/repository owner must make and record the enforcement
decision before any merge to `main`.

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

No request shape is accepted. This establishes a minimal future seam without
defining an Atlas credential, actor, permission, data, or transport protocol.

## Security-sensitive decisions deferred (stop gates)

Do **not** implement a transport until Atlas approves all of the following:

1. The service-to-service authentication and credential-exchange design.
2. Authorization, tenant/project isolation, and Flowise workflow ownership
   checks for create/read/run/abort operations. This includes Atlas-owned,
   server-minted run and session references; a Flowise `chatId` or session ID
   supplied by a client cannot be trusted or forwarded as an Atlas run scope.
3. Deployment containment: private network boundary, ingress policy, and
   operational ownership of the isolated Flowise runtime. The ingress must
   strip client-supplied `x-request-from`, deny public/UI access, and explicitly
   handle the complete Flowise prefix allow-list before any transport exists.
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
    redaction, access-control, and operational-ownership decisions.
14. Operator access and flow-definition change control: who can access the
    Flowise canvas or its administrative APIs, how workflow changes are approved
    and audited, and how that control preserves tenant/trust-domain isolation.

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

The standalone `Atlas AgentFlow Adapter Boundary` workflow runs this contract on
both pull requests and all pushes with Node 20, without installing or
starting Flowise. The contract also protects the root container-build exclusion
for `atlas/`; it does not validate the separate inherited `docker/Dockerfile`,
which does not copy the repository context. The inherited
standard Flowise CI workflow was intentionally left unchanged to avoid coupling
this isolated check to a full Flowise dependency installation. The `atlas/`
directory is excluded from Flowise container build contexts, preserving the
skeleton's separation from Flowise runtime images.

The repository-wide Flowise build was not treated as a release signal in this
Phase-0 change: the local environment has Node `24.14.0`, while the pinned
repository declares Node `>=18.15.0 <19.0.0 || ^20`, and pnpm 11's install
policy rejects unapproved native build scripts. No dependency, lockfile, or
upstream change was retained.
