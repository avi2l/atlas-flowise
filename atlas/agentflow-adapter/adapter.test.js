'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

function assertSupportedDirectoryEntry(entry, entryPath) {
    if (!entry.isDirectory() && !entry.isFile()) {
        assert.fail(`Unsupported adapter boundary entry: ${entryPath}`)
    }
}

function collectAdapterSources(directory, rootDirectory = directory, rejectUnsupportedEntries = false, ignoredDirectories = []) {
    const sourceFiles = []

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)

        if (rejectUnsupportedEntries) {
            assertSupportedDirectoryEntry(entry, entryPath)
        }

        if (entry.isDirectory() && !ignoredDirectories.includes(entry.name)) {
            sourceFiles.push(...collectAdapterSources(entryPath, rootDirectory, rejectUnsupportedEntries, ignoredDirectories))
        } else if (entry.isFile()) {
            sourceFiles.push({
                name: path.relative(rootDirectory, entryPath).split(path.sep).join('/'),
                source: fs.readFileSync(entryPath, 'utf8')
            })
        }
    }

    return sourceFiles
}

const adapterDirectoryEntries = collectAdapterSources(__dirname, __dirname, true)
const adapterSources = adapterDirectoryEntries.filter(({ name }) => name === 'adapter.js')
const adapterWorkflowSource = fs.readFileSync(path.join(__dirname, '../../.github/workflows/atlas-agentflow-adapter.yml'), 'utf8')
const phaseZeroDocumentationSource = fs.readFileSync(path.join(__dirname, '../../docs/atlas-agentflow-phase0.md'), 'utf8')
const adapterReadmeSource = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8')
const pnpmWorkspaceSource = fs.readFileSync(path.join(__dirname, '../../pnpm-workspace.yaml'), 'utf8')
const rootPackageSource = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
const turboSource = fs.readFileSync(path.join(__dirname, '../../turbo.json'), 'utf8')

const dockerIgnoreSource = fs.readFileSync(path.join(__dirname, '../../.dockerignore'), 'utf8')
const flowiseRuntimeDirectories = [path.join(__dirname, '../../packages'), path.join(__dirname, '../../docker')]
const flowiseRuntimeIgnoredDirectories = ['node_modules', 'dist', 'build', '.turbo']

const prohibitedRuntimeAccess =
    /\b(?:require|import|process|globalThis|console|WebSocket|EventSource|XMLHttpRequest|navigator|Bun|Deno)\b|\b(?:eval|Function|fetch)\b|\bmodule\.constructor\._load\b|\b(?:fs|http|https|net|tls|child_process)\s*\./

function assertAdapterSourcesAreSafe() {
    assert.deepEqual(adapterDirectoryEntries.map(({ name }) => name).sort(), ['README.md', 'adapter.js', 'adapter.test.js'])

    for (const { source } of adapterSources) {
        assert.doesNotMatch(source, prohibitedRuntimeAccess)
    }

    assert.match(adapterSources[0].source, /const NON_PRODUCTION_ADAPTER_DEPENDENCIES = Object\.freeze\(\[\]\)/)
}

const runtimeSourceExtensions = new Set(['.cjs', '.js', '.json', '.jsx', '.mjs', '.sh', '.ts', '.tsx', '.yaml', '.yml'])

function collectRuntimeSources(directory, rootDirectory = directory) {
    const sourceFiles = []

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)

        if (entry.isDirectory() && !flowiseRuntimeIgnoredDirectories.includes(entry.name)) {
            sourceFiles.push(...collectRuntimeSources(entryPath, rootDirectory))
        } else if (entry.isFile() && runtimeSourceExtensions.has(path.extname(entry.name))) {
            sourceFiles.push({
                name: path.relative(rootDirectory, entryPath).split(path.sep).join('/'),
                source: fs.readFileSync(entryPath, 'utf8')
            })
        }
    }

    return sourceFiles
}

function assertFlowiseRuntimeDoesNotReferenceAdapter() {
    const runtimeSources = flowiseRuntimeDirectories.flatMap((directory) => collectRuntimeSources(directory, directory))

    for (const { name, source } of runtimeSources) {
        assert.doesNotMatch(source, /(?:atlas[\\/])?agentflow-adapter/, name)
    }
}

function assertFlowiseBuildGraphDoesNotReferenceAdapter(
    sources = [
        ['pnpm-workspace.yaml', pnpmWorkspaceSource],
        ['package.json', rootPackageSource],
        ['turbo.json', turboSource]
    ]
) {
    for (const [name, source] of sources) {
        assert.doesNotMatch(source, /(?:^|[\s"'`])(?:\.\/)?atlas(?:[\\/]|-agentflow-adapter\b|["'\s]|$)/im, name)
    }
}

function assertValidationInvocationRunsBeforeAdapterLoads(source) {
    const normalizedSource = source.replace(/\r\n/g, '\n')
    const validationMatch = normalizedSource.match(/^assertAdapterSourcesAreSafe\(\)\n\nfunction loadVerifiedAdapter/m)
    const adapterLoadOffset = normalizedSource.lastIndexOf("return require('./adapter')")

    assert.notEqual(validationMatch, null)
    assert.notEqual(adapterLoadOffset, -1)
    assert.ok(validationMatch.index < adapterLoadOffset, 'Adapter source validation must run before the adapter load.')
}

test('validation placement check rejects a decoy validation marker after the adapter load', () => {
    const source = [
        'const marker = `assertAdapterSourcesAreSafe()\n\nfunction loadVerifiedAdapter`',
        "function loadVerifiedAdapter() { return require('./adapter') }",
        'assertAdapterSourcesAreSafe()'
    ].join('\n')

    assert.throws(() => assertValidationInvocationRunsBeforeAdapterLoads(source))
})

test('validation placement check accepts a CRLF-encoded source when validation precedes loading', () => {
    const source = "assertAdapterSourcesAreSafe()\r\n\r\nfunction loadVerifiedAdapter() { return require('./adapter') }"

    assert.doesNotThrow(() => assertValidationInvocationRunsBeforeAdapterLoads(source))
})

assertAdapterSourcesAreSafe()

function loadVerifiedAdapter() {
    return require('./adapter')
}

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

test('adapter source is verified before the test process loads it', () => {
    assert.equal(require.cache[require.resolve('./adapter')], undefined)
})

test('adapter source validation is installed before any test can load the adapter', () => {
    assertValidationInvocationRunsBeforeAdapterLoads(fs.readFileSync(__filename, 'utf8'))
})

test('Phase 0 documentation defers permissive Flowise browser controls to private ingress', () => {
    assert.match(phaseZeroDocumentationSource, /CORS_ORIGINS/)
    assert.match(phaseZeroDocumentationSource, /IFRAME_ORIGINS/)
})

test('adapter README identifies adapter.js as the limited static-tripwire scope', () => {
    assert.match(adapterReadmeSource, /static tripwire is limited\s+to `adapter\.js`/)
})

test('non-production adapter has an explicit dependency-free, no-I/O boundary', () => {
    assertAdapterSourcesAreSafe()
})

test('runtime source collection excludes dependency and generated-output directories', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        fs.writeFileSync(path.join(fixtureDirectory, 'runtime.js'), "'use strict'\n")
        for (const directory of ['node_modules', 'dist', 'build', '.turbo']) {
            fs.mkdirSync(path.join(fixtureDirectory, directory))
            fs.writeFileSync(path.join(fixtureDirectory, directory, 'generated.js'), "'use strict'\n")
        }

        assert.deepEqual(
            collectAdapterSources(fixtureDirectory, fixtureDirectory, false, ['node_modules', 'dist', 'build', '.turbo'])
                .map(({ name }) => name)
                .sort(),
            ['runtime.js']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection reads only explicit source file types', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        fs.writeFileSync(path.join(fixtureDirectory, 'runtime.js'), "'use strict'\n")
        fs.writeFileSync(path.join(fixtureDirectory, '.env'), 'ATLAS_TOKEN=must-not-be-read\n')
        fs.writeFileSync(path.join(fixtureDirectory, 'upload.bin'), 'must-not-be-read\n')
        fs.writeFileSync(path.join(fixtureDirectory, 'README.md'), 'must-not-be-read\n')

        assert.deepEqual(
            collectRuntimeSources(fixtureDirectory, fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['runtime.js']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('adapter source collector covers nested JavaScript module variants', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        fs.mkdirSync(path.join(fixtureDirectory, 'nested'))
        for (const relativePath of [
            'adapter.js',
            'nested/helper.cjs',
            'nested/helper.mjs',
            'nested/helper.ts',
            'nested/helper.jsx',
            'nested/helper.tsx',
            'nested/package.json'
        ]) {
            fs.writeFileSync(path.join(fixtureDirectory, relativePath), "'use strict'\n")
        }

        assert.deepEqual(
            collectAdapterSources(fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            [
                'adapter.js',
                'nested/helper.cjs',
                'nested/helper.jsx',
                'nested/helper.mjs',
                'nested/helper.ts',
                'nested/helper.tsx',
                'nested/package.json'
            ]
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('adapter directory collector includes every file type so a closed boundary can reject credentials', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        fs.writeFileSync(path.join(fixtureDirectory, 'adapter.js'), "'use strict'\n")
        fs.writeFileSync(path.join(fixtureDirectory, '.env'), 'ATLAS_TOKEN=must-not-be-present\n')
        fs.writeFileSync(path.join(fixtureDirectory, 'runtime.sh'), '#!/bin/sh\n')

        assert.deepEqual(
            collectAdapterSources(fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['.env', 'adapter.js', 'runtime.sh']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('adapter directory collector rejects unsupported entries such as symbolic links', () => {
    const unsupportedEntry = {
        isDirectory: () => false,
        isFile: () => false
    }

    assert.throws(() => assertSupportedDirectoryEntry(unsupportedEntry, 'credential-link'), /Unsupported adapter boundary entry/)
})

test('no-I/O boundary check rejects static imports', () => {
    assert.match("import { readFile } from 'node:fs'", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects console output', () => {
    assert.match("console.log('must not emit adapter request data')", prohibitedRuntimeAccess)
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

test('no-I/O boundary check rejects browser and alternate-runtime network or environment capabilities', () => {
    assert.match("new WebSocket('wss://example.invalid')", prohibitedRuntimeAccess)
    assert.match("new EventSource('https://example.invalid')", prohibitedRuntimeAccess)
    assert.match("new XMLHttpRequest('https://example.invalid')", prohibitedRuntimeAccess)
    assert.match("navigator.sendBeacon('https://example.invalid')", prohibitedRuntimeAccess)
    assert.match('Bun.env.ATLAS_TOKEN', prohibitedRuntimeAccess)
    assert.match("Deno.env.get('ATLAS_TOKEN')", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects dynamic code evaluation', () => {
    assert.match("eval('arbitrary code')", prohibitedRuntimeAccess)
    assert.match("new Function('return arbitraryValue')", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects indirect CommonJS runtime loading', () => {
    assert.match("module.constructor._load('node:fs').readFileSync('sensitive-file')", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects module require capability loading', () => {
    assert.match("module.require('node:fs').readFileSync('sensitive-file')", prohibitedRuntimeAccess)
})

test('adapter boundary workflow runs for every pull request and push', () => {
    assert.doesNotMatch(adapterWorkflowSource, /^\s+paths(?:-ignore)?:/m)
    assert.doesNotMatch(adapterWorkflowSource, /^\s+branches(?:-ignore)?:/m)
    assert.match(adapterWorkflowSource, /^\s{4}pull_request:\s*$/m)
    assert.match(adapterWorkflowSource, /^\s{4}push:\s*$/m)
    assert.match(adapterWorkflowSource, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262/)
    assert.match(adapterWorkflowSource, /persist-credentials:\s*false/)
    assert.match(adapterWorkflowSource, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020/)
    assert.match(adapterWorkflowSource, /timeout-minutes:\s*5/)
    assert.match(adapterWorkflowSource, /node --test atlas\/agentflow-adapter\/\*\.test\.js/)
})

test('Phase 0 documentation accurately describes the adapter workflow trigger scope', () => {
    assert.doesNotMatch(phaseZeroDocumentationSource, /scoped pushes/)
})

test('Phase 0 documentation does not preserve a stale contract-test count', () => {
    assert.doesNotMatch(phaseZeroDocumentationSource, /# \d+ pass, \d+ fail/)
})

test('Phase 0 documentation defers tenancy, resource, and queue containment decisions', () => {
    assert.match(phaseZeroDocumentationSource, /shared Flowise instance/i)
    assert.match(phaseZeroDocumentationSource, /resource exhaustion/i)
    assert.match(phaseZeroDocumentationSource, /queue mode/i)
})

test('root container build context excludes the non-production adapter', () => {
    assert.match(dockerIgnoreSource, /^atlas\/$/m)
    assert.doesNotMatch(dockerIgnoreSource, /^!atlas(?:\/|$)/m)
})

test('Flowise runtime sources do not import, require, or reference the non-production adapter', () => {
    assertFlowiseRuntimeDoesNotReferenceAdapter()
})

test('Flowise build-graph guard rejects a bare atlas workspace entry', () => {
    assert.throws(
        () => assertFlowiseBuildGraphDoesNotReferenceAdapter([['pnpm-workspace.yaml', "packages:\n  - 'atlas'"]]),
        /pnpm-workspace.yaml/
    )
})

test('Flowise build-graph manifests do not wire in the non-production adapter', () => {
    assertFlowiseBuildGraphDoesNotReferenceAdapter()
})

test('non-production adapter exposes only its closed disabled contract', () => {
    const adapterModule = loadVerifiedAdapter()
    const adapter = adapterModule.createNonProductionAdapter()

    assert.deepEqual(Object.keys(adapterModule).sort(), [
        'NON_PRODUCTION_ADAPTER_DEPENDENCIES',
        'NonProductionAdapterError',
        'createNonProductionAdapter'
    ])
    assert.deepEqual(Object.keys(adapter).sort(), ['abort', 'enabled', 'run'])
})

test('non-production adapter rejects construction and run arguments without inspecting caller data', async () => {
    const { createNonProductionAdapter, NonProductionAdapterError, NON_PRODUCTION_ADAPTER_DEPENDENCIES } = loadVerifiedAdapter()
    const adapter = createNonProductionAdapter(inaccessibleRequest(), inaccessibleRequest())

    assert.deepEqual(NON_PRODUCTION_ADAPTER_DEPENDENCIES, [])
    assert.equal(adapter.enabled, false)
    await assert.rejects(adapter.run(inaccessibleRequest(), inaccessibleRequest()), (error) => {
        assert.equal(error instanceof NonProductionAdapterError, true)
        assert.equal(error.code, 'ATLAS_AGENTFLOW_ADAPTER_DISABLED')
        assert.equal(error.operation, 'run')
        assert.deepEqual(Object.keys(error).sort(), ['code', 'name', 'operation'])
        assert.equal(Object.hasOwn(error, 'request'), false)
        assert.equal(Object.hasOwn(error, 'cause'), false)
        return true
    })
})

test('non-production adapter rejects construction and abort arguments without inspecting caller data', async () => {
    const { createNonProductionAdapter, NonProductionAdapterError } = loadVerifiedAdapter()
    const adapter = createNonProductionAdapter(inaccessibleRequest(), inaccessibleRequest())

    await assert.rejects(adapter.abort(inaccessibleRequest(), inaccessibleRequest()), (error) => {
        assert.equal(error instanceof NonProductionAdapterError, true)
        assert.equal(error.code, 'ATLAS_AGENTFLOW_ADAPTER_DISABLED')
        assert.equal(error.operation, 'abort')
        assert.deepEqual(Object.keys(error).sort(), ['code', 'name', 'operation'])
        assert.equal(Object.hasOwn(error, 'request'), false)
        assert.equal(Object.hasOwn(error, 'cause'), false)
        return true
    })
})
