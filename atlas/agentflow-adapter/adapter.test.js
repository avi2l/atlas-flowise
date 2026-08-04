'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { createNonProductionAdapter, NonProductionAdapterError } = require('./adapter')

test('non-production adapter is disabled and rejects run requests without transport activity', async () => {
    const adapter = createNonProductionAdapter()

    assert.equal(adapter.enabled, false)
    await assert.rejects(
        adapter.run({ flowRef: 'flow-placeholder', runRef: 'run-placeholder', input: { kind: 'metadata-only' } }),
        (error) => error instanceof NonProductionAdapterError && error.code === 'ATLAS_AGENTFLOW_ADAPTER_DISABLED'
    )
})

test('non-production adapter rejects abort requests without accepting identity or credentials', async () => {
    const adapter = createNonProductionAdapter()

    await assert.rejects(
        adapter.abort({ flowRef: 'flow-placeholder', runRef: 'run-placeholder' }),
        (error) => error instanceof NonProductionAdapterError && error.code === 'ATLAS_AGENTFLOW_ADAPTER_DISABLED'
    )
})
