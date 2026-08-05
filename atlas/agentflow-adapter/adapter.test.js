'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const { createNonProductionAdapter, NonProductionAdapterError, NON_PRODUCTION_ADAPTER_DEPENDENCIES } = require('./adapter')

const adapterSources = fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js'))
    .map((entry) => ({ name: entry.name, source: fs.readFileSync(path.join(__dirname, entry.name), 'utf8') }))
const adapterWorkflowSource = fs.readFileSync(path.join(__dirname, '../../.github/workflows/atlas-agentflow-adapter.yml'), 'utf8')

const dockerIgnoreSource = fs.readFileSync(path.join(__dirname, '../../.dockerignore'), 'utf8')

const prohibitedRuntimeAccess =
    /\b(?:require|import|process|globalThis)\b|\b(?:eval|Function|fetch)\b|\b(?:fs|http|https|net|tls|child_process)\s*\./

function inaccessibleRequest() {
    return new Proxy(
        {},
        {
            get() {
                throw new Error('The disabled adapter must not inspect request data.')
            },
            has() {
                throw new Error('The disabled adapter must not inspect request data.')
            },
            ownKeys() {
                throw new Error('The disabled adapter must not inspect request data.')
            },
            getOwnPropertyDescriptor() {
                throw new Error('The disabled adapter must not inspect request data.')
            },
            getPrototypeOf() {
                throw new Error('The disabled adapter must not inspect request data.')
            }
        }
    )
}

test('non-production adapter has an explicit dependency-free, no-I/O boundary', () => {
    assert.deepEqual(NON_PRODUCTION_ADAPTER_DEPENDENCIES, [])
    assert.deepEqual(
        adapterSources.map(({ name }) => name),
        ['adapter.js']
    )

    for (const { source } of adapterSources) {
        assert.doesNotMatch(source, prohibitedRuntimeAccess)
    }
})

test('no-I/O boundary check rejects static imports', () => {
    assert.match("import { readFile } from 'node:fs'", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects computed environment access', () => {
    assert.match("process['env'].ATLAS_TOKEN", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects an aliased global fetch capability', () => {
    assert.match("const send = fetch; send('https://example.invalid')", prohibitedRuntimeAccess)
})

test('inaccessible request rejects reflective inspection', () => {
    const request = inaccessibleRequest()

    for (const inspect of [
        () => Object.keys(request),
        () => Reflect.ownKeys(request),
        () => 'credential' in request,
        () => Object.getPrototypeOf(request),
        () => Object.getOwnPropertyDescriptor(request, 'credential')
    ]) {
        assert.throws(inspect, /must not inspect request data/)
    }
})

test('no-I/O boundary check rejects global runtime capabilities', () => {
    assert.match("globalThis.fetch('https://example.invalid')", prohibitedRuntimeAccess)
    assert.match('globalThis.process.env.ATLAS_TOKEN', prohibitedRuntimeAccess)
    assert.match('const { env } = process', prohibitedRuntimeAccess)
    assert.match("require('node:dns').lookup('example.invalid')", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects dynamic code evaluation', () => {
    assert.match("eval('arbitrary code')", prohibitedRuntimeAccess)
    assert.match("new Function('return arbitraryValue')", prohibitedRuntimeAccess)
})

test('adapter boundary workflow runs for every pull request and push', () => {
    assert.doesNotMatch(adapterWorkflowSource, /^\s+paths(?:-ignore)?:/m)
    assert.match(adapterWorkflowSource, /^\s{4}pull_request:\s*$/m)
    assert.match(adapterWorkflowSource, /^\s{4}push:\s*$/m)
    assert.match(adapterWorkflowSource, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/)
    assert.match(adapterWorkflowSource, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/)
})

test('root container build context excludes the non-production adapter', () => {
    assert.match(dockerIgnoreSource, /^atlas\/$/m)
    assert.doesNotMatch(dockerIgnoreSource, /^!atlas(?:\/|$)/m)
})

test('non-production adapter rejects construction and run arguments without inspecting caller data', async () => {
    const adapter = createNonProductionAdapter(inaccessibleRequest(), inaccessibleRequest())

    assert.equal(adapter.enabled, false)
    await assert.rejects(adapter.run(inaccessibleRequest(), inaccessibleRequest()), (error) => {
        assert.equal(error instanceof NonProductionAdapterError, true)
        assert.equal(error.code, 'ATLAS_AGENTFLOW_ADAPTER_DISABLED')
        assert.equal(error.operation, 'run')
        return true
    })
})

test('non-production adapter rejects construction and abort arguments without inspecting caller data', async () => {
    const adapter = createNonProductionAdapter(inaccessibleRequest(), inaccessibleRequest())

    await assert.rejects(adapter.abort(inaccessibleRequest(), inaccessibleRequest()), (error) => {
        assert.equal(error instanceof NonProductionAdapterError, true)
        assert.equal(error.code, 'ATLAS_AGENTFLOW_ADAPTER_DISABLED')
        assert.equal(error.operation, 'abort')
        return true
    })
})
