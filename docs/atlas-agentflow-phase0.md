# Atlas / Flowise AgentFlow — Phase 0 reconnaissance and boundary

**Status:** reconnaissance complete; adapter remains deliberately disabled.
**Scope:** Flowise `2.2.7`, pinned at `cf7d841f88504bba465790eb906f6d758b91ee2c`.
No upstream synchronization, package upgrade, deployment, credential import,
production-data access, database change, or identity/security architecture
change was performed.

This document records engineering observations, not an authorization to connect
Atlas to Flowise.

## Compatibility findings

| Area                       | Observation in the pinned tree                                                                                                                                                                         | Integration consequence                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AgentFlow model            | `packages/server/src/utils/buildChatflow.ts` uses `MULTIAGENT` for one AgentFlow classification path, while execution can also select `buildAgentGraph.ts` from ending-node categories.                | Atlas must treat the pinned runtime as an isolated workflow/canvas engine, not as the system of record. A future allow-list or routing rule cannot rely on the chatflow type alone.                                                            |
| AgentFlow discovery and UI | `packages/server/src/services/chatflows/index.ts` and `packages/ui/src/api/chatflows.js` query `MULTIAGENT`; Flowise exposes its own `/agentflows` UI in `packages/ui/src/views/agentflows/index.jsx`. | The Flowise UI has no Atlas context. Do not embed or expose it as an Atlas endpoint in Phase 0.                                                                                                                                                |
| Execution data             | `buildChatflow.ts` creates/stores chat messages and sends AgentFlow telemetry. Flowise telemetry is enabled unless `DISABLE_FLOWISE_TELEMETRY=true`.                                                   | Atlas project, actor, assignment, review, governance, and event-outbox records must remain outside Flowise, as required by `ATLAS_UPSTREAM.md`. No runtime is started in Phase 0; telemetry handling is an explicit future data-handling gate. |
| Example content            | `packages/server/marketplaces/agentflows/` contains example flow JSON.                                                                                                                                 | Examples are reconnaissance material only; no marketplace flow or production data is imported into the adapter.                                                                                                                                |
| License/pin                | `ATLAS_UPSTREAM.md` records Apache 2.0 for this exact release and forbids automatic upstream sync.                                                                                                     | Any future upstream change requires the recorded per-change license/security/API review; no later enterprise/commercial code may be copied.                                                                                                    |

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
   enter Flowise's database through this work.
3. Atlas owns the external run lifecycle and audit record; Flowise is an
   isolated runtime dependency only.
4. A Flowise execution identifier is an opaque runtime reference, not an Atlas
   actor, project, permission, or authorization claim.
5. The disabled local skeleton cannot initiate or abort an execution, perform
   I/O, or load configuration/secrets.

## Phase-0 adapter contract

`atlas/agentflow-adapter/adapter.js` is intentionally plain CommonJS and sits
outside the pnpm workspace and Flowise build graph. Root lint tooling can still
glob this directory, so the adapter follows repository formatting conventions.
Its only behavior is fail-closed:

-   `enabled` is always `false`.
-   `run({ flowRef, runRef, input })` rejects.
-   `abort({ flowRef, runRef })` rejects.
-   The rejected error has code `ATLAS_AGENTFLOW_ADAPTER_DISABLED`.

The provided reference names are deliberately opaque. This establishes a
minimal future seam without defining an Atlas credential, actor, permission,
or transport protocol.

## Security-sensitive decisions deferred (stop gates)

Do **not** implement a transport until Atlas approves all of the following:

1. The service-to-service authentication and credential-exchange design.
2. Authorization, tenant/project isolation, and Flowise workflow ownership
   checks for create/read/run/abort operations. This includes Atlas-owned,
   server-minted run and session references; a Flowise `chatId` or session ID
   supplied by a client cannot be trusted or forwarded as an Atlas run scope.
3. Deployment containment: private network boundary, ingress policy, and
   operational ownership of the isolated Flowise runtime.
4. Run lifecycle semantics, especially cancellation and human-in-the-loop
   continuation, plus durable Atlas audit/event ownership.
5. Data classification, redaction, retention, and approved handling of inputs,
   outputs, uploads, traces, telemetry, and logs, including Flowise's
   default-on telemetry posture and its `DISABLE_FLOWISE_TELEMETRY` control.
6. A version-specific, allow-listed input contract that rejects Flowise
   `overrideConfig`, node-input, variable, credential-reference, and upload
   overrides unless Atlas explicitly authorizes each capability.

These are architecture decisions with security impact. Their absence is why
this Phase-0 adapter stays disabled. The inherited repository-dispatch
workflows are also deferred for a separate GitHub Actions security review; they
can be triggered by merging work to `main`, so this branch must not be merged
to `main` until that decision is recorded. This work neither runs nor
configures them.

## Verification

The adapter was developed test-first using Node's built-in test runner. The
initial test failed because `./adapter` did not exist; after the minimal
fail-closed implementation, the contract test passed:

```text
node --test atlas/agentflow-adapter/adapter.test.js
# 2 pass, 0 fail
```

The repository-wide Flowise build was not treated as a release signal in this
Phase-0 change: the local environment has Node `24.14.0`, while the pinned
repository declares Node `>=18.15.0 <19.0.0 || ^20`, and pnpm 11's install
policy rejects unapproved native build scripts. No dependency, lockfile, or
upstream change was retained.
