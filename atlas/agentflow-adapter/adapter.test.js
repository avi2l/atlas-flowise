'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { createNonProductionAdapter, NonProductionAdapterError } = require('./adapter')

function inaccessibleRequest() {
    return new Proxy(
        {},
        {
            get() {
                throw new Error('The disabled adapter must not inspect request data.')
            }
        }
    )
}

test('non-production adapter rejects run requests without inspecting caller data', async () => {
    const adapter = createNonProductionAdapter()

    assert.equal(adapter.enabled, false)
    await assert.rejects(adapter.run(inaccessibleRequest()), (error) => {
        assert.equal(error instanceof NonProductionAdapterError, true)
        assert.equal(error.code, 'ATLAS_AGENTFLOW_ADAPTER_DISABLED')
        assert.equal(error.operation, 'run')
        return true
    })
})

test('non-production adapter rejects abort requests without inspecting caller data', async () => {
    const adapter = createNonProductionAdapter()

    await assert.rejects(adapter.abort(inaccessibleRequest()), (error) => {
        assert.equal(error instanceof NonProductionAdapterError, true)
        assert.equal(error.code, 'ATLAS_AGENTFLOW_ADAPTER_DISABLED')
        assert.equal(error.operation, 'abort')
        return true
    })
})
