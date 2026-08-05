'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const { createNonProductionAdapter, NonProductionAdapterError, NON_PRODUCTION_ADAPTER_DEPENDENCIES } = require('./adapter')

const adapterSource = fs.readFileSync(path.join(__dirname, 'adapter.js'), 'utf8')

const prohibitedRuntimeAccess = /\b(?:require|import|process|globalThis)\b|\bfetch\s*\(|\b(?:fs|http|https|net|tls|child_process)\s*\./

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

test('non-production adapter has an explicit dependency-free, no-I/O boundary', () => {
    assert.deepEqual(NON_PRODUCTION_ADAPTER_DEPENDENCIES, [])
    assert.doesNotMatch(adapterSource, prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects static imports', () => {
    assert.match("import { readFile } from 'node:fs'", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects computed environment access', () => {
    assert.match("process['env'].ATLAS_TOKEN", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects global runtime capabilities', () => {
    assert.match("globalThis.fetch('https://example.invalid')", prohibitedRuntimeAccess)
    assert.match('globalThis.process.env.ATLAS_TOKEN', prohibitedRuntimeAccess)
    assert.match('const { env } = process', prohibitedRuntimeAccess)
    assert.match("require('node:dns').lookup('example.invalid')", prohibitedRuntimeAccess)
})

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
