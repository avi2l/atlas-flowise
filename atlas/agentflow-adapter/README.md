# Atlas AgentFlow adapter skeleton (Phase 0)

This directory is a **non-production boundary contract**, not an integration.
It is intentionally outside the Flowise pnpm workspace and is not imported by,
wired into, or reachable from Flowise.

## Current behavior

`createNonProductionAdapter()` always returns an adapter with `enabled: false`.
Both `run()` and `abort()` always reject with
`ATLAS_AGENTFLOW_ADAPTER_DISABLED` and report only the attempted operation.
They do not inspect caller arguments, make network calls, read
configuration or environment variables, accept credentials, persist data, or
call Flowise. Its exported dependency declaration is intentionally empty. The contract
test closed-lists every file in this directory. Its static tripwire is limited
to `adapter.js` and rejects imports and common filesystem, network,
process-environment, and child-process access; neither check is a complete proof
against every indirect JavaScript runtime capability.

No request contract exists in Phase 0. The adapter deliberately does not model
Atlas users, actors, permissions, projects, assignments, credentials, inputs,
or production records.

## Explicit non-goals

-   No Flowise route, UI, database entity, migration, or runtime change.
-   No Atlas identity, authorization, permissions, secrets, production data, or
    external service configuration.
-   No transport, retry, webhook, event-outbox, streaming, or deployment path.

## Gate for a future transport

A future transport implementation requires an explicit Atlas architecture and
security decision covering caller authentication, authorization, tenant/project
isolation, Flowise deployment containment, run cancellation, data retention,
audit/event ownership, and the approved credential exchange. It must be
implemented in the separate Atlas-owned AgentFlow service, not enabled by this
skeleton.

Run the contract test with:

```sh
node --test atlas/agentflow-adapter/adapter.test.js
```
