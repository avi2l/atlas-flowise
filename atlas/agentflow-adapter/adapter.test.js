'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const adapterBoundaryFiles = ['README.md', 'adapter.js', 'adapter.test.js']

function assertSupportedDirectoryEntry(entry, entryPath) {
    if (!entry.isDirectory() && !entry.isFile()) {
        assert.fail(`Unsupported adapter boundary entry: ${entryPath}`)
    }
}

function readAdapterSourceFiles(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    const entryNames = entries.map(({ name }) => name).sort()

    assert.deepEqual(entryNames, adapterBoundaryFiles, 'Unexpected adapter boundary entries')

    return entries.map((entry) => {
        assertSupportedDirectoryEntry(entry, path.join(directory, entry.name))
        assert.ok(entry.isFile(), `Adapter boundary entry must be a file: ${entry.name}`)
        const entryPath = path.join(directory, entry.name)

        return {
            name: entry.name,
            source: fs.readFileSync(entryPath, 'utf8')
        }
    })
}

const adapterDirectoryEntries = readAdapterSourceFiles(__dirname)
const adapterSources = adapterDirectoryEntries.filter(({ name }) => name === 'adapter.js')
const adapterWorkflowSource = fs
    .readFileSync(path.join(__dirname, '../../.github/workflows/atlas-agentflow-adapter.yml'), 'utf8')
    .replace(/\r\n/g, '\n')
const phaseZeroDocumentationSource = fs.readFileSync(path.join(__dirname, '../../docs/atlas-agentflow-phase0.md'), 'utf8')
const atlasUpstreamSource = fs.readFileSync(path.join(__dirname, '../../ATLAS_UPSTREAM.md'), 'utf8')
const adapterReadmeSource = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8')
const pnpmWorkspaceSource = fs.readFileSync(path.join(__dirname, '../../pnpm-workspace.yaml'), 'utf8')
const rootPackageSource = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
const turboSource = fs.readFileSync(path.join(__dirname, '../../turbo.json'), 'utf8')

const dockerIgnoreSource = fs.readFileSync(path.join(__dirname, '../../.dockerignore'), 'utf8')
const flowiseRuntimeDirectories = [
    path.join(__dirname, '../../packages'),
    path.join(__dirname, '../../docker'),
    path.join(__dirname, '../../.github')
]
const atlasAdapterWorkflowName = 'atlas-agentflow-adapter.yml'
const flowiseRuntimeFiles = [path.join(__dirname, '../../Dockerfile')]
const flowiseRuntimeIgnoredDirectories = ['node_modules', 'dist', 'build', '.turbo']

const prohibitedRuntimeAccess =
    /\b(?:require|import|process|globalThis|console|WebSocket|EventSource|XMLHttpRequest|navigator|Bun|Deno)\b|\b(?:eval|Function|fetch)\b|\bmodule(?:\.constructor(?:\._load\b|\s*\[)|\s*\[)|\b(?:fs|http|https|net|tls|child_process)\s*\./

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

        assertSupportedDirectoryEntry(entry, entryPath)

        if (entry.isDirectory() && !flowiseRuntimeIgnoredDirectories.includes(entry.name)) {
            sourceFiles.push(...collectRuntimeSources(entryPath, rootDirectory))
        } else if (entry.isFile() && (entry.name === 'Dockerfile' || runtimeSourceExtensions.has(path.extname(entry.name)))) {
            sourceFiles.push({
                name: path.relative(rootDirectory, entryPath).split(path.sep).join('/'),
                source: fs.readFileSync(entryPath, 'utf8')
            })
        }
    }

    return sourceFiles
}

function collectFlowiseRuntimeSources() {
    return flowiseRuntimeDirectories
        .flatMap((directory) => collectRuntimeSources(directory, directory))
        .filter(({ name }) => name !== `workflows/${atlasAdapterWorkflowName}`)
        .concat(
            flowiseRuntimeFiles.map((filePath) => ({
                name: path.basename(filePath),
                source: fs.readFileSync(filePath, 'utf8')
            }))
        )
}

function assertFlowiseRuntimeDoesNotReferenceAdapter(runtimeSources = collectFlowiseRuntimeSources()) {
    for (const { name, source } of runtimeSources) {
        assert.doesNotMatch(source, /(?:atlas[\\/])?agentflow-adapter/, name)
    }
}

function assertDockerIgnoreExcludesAtlasDirectory(source) {
    const patterns = source
        .split(String.fromCharCode(10))
        .map((line) => line.trim())
        .filter(Boolean)

    assert.ok(patterns.includes('atlas/'), 'The root Docker build must exclude atlas/.')

    for (const pattern of patterns.filter((line) => line.startsWith('!'))) {
        assert.doesNotMatch(pattern.slice(1), /(?:^|\/|\*\*)atlas(?:\/|\*|$)/i, 'Docker ignore rules must not re-include atlas/.')
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
    const normalizedSource = source.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))
    const validationMatch = normalizedSource.match(/^assertAdapterSourcesAreSafe\(\)\n\nfunction loadVerifiedAdapter/m)
    const adapterLoadMarker = ['return require', "('./adapter')"].join('')
    const adapterLoadOffset = normalizedSource.indexOf(adapterLoadMarker)

    assert.notEqual(validationMatch, null)
    assert.notEqual(adapterLoadOffset, -1)
    assert.ok(validationMatch.index < adapterLoadOffset, 'Adapter source validation must run before the adapter load.')
}

test('validation placement check rejects a decoy validation marker after the adapter load', () => {
    const adapterLoad = ["return require('./", "adapter')"].join('')
    const source = [
        'const marker = `assertAdapterSourcesAreSafe()\n\nfunction loadVerifiedAdapter`',
        `function loadVerifiedAdapter() { ${adapterLoad} }`,
        'assertAdapterSourcesAreSafe()'
    ].join('\n')

    assert.throws(() => assertValidationInvocationRunsBeforeAdapterLoads(source))
})

test('validation placement check rejects an earlier adapter load before the validated loader', () => {
    const adapterLoad = ["return require('./", "adapter')"].join('')
    const source = [
        `function preload() { ${adapterLoad} }`,
        'assertAdapterSourcesAreSafe()',
        '',
        `function loadVerifiedAdapter() { ${adapterLoad} }`
    ].join('\n')

    assert.throws(() => assertValidationInvocationRunsBeforeAdapterLoads(source))
})

test('validation placement check accepts a CRLF-encoded source when validation precedes loading', () => {
    const adapterLoad = ["return require('./", "adapter')"].join('')
    const source = ['assertAdapterSourcesAreSafe()', `function loadVerifiedAdapter() { ${adapterLoad} }`].join(
        String.fromCharCode(13, 10) + String.fromCharCode(13, 10)
    )

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

test('Phase 0 documentation records the queue administration exposure and ingress normalization gate', () => {
    assert.match(phaseZeroDocumentationSource, /\/admin\/queues/)
    assert.match(phaseZeroDocumentationSource, /normalize or reject traversal and encoded path forms/i)
})

test('Phase 0 documentation records the Flowise SSE chatId capability and unscoped API-key boundary', () => {
    assert.match(phaseZeroDocumentationSource, /chatId.*capability/i)
    assert.match(phaseZeroDocumentationSource, /Atlas-minted.*unguessable/i)
    assert.match(phaseZeroDocumentationSource, /every\s+valid Flowise API key/i)
    assert.match(phaseZeroDocumentationSource, /not\s+scoped to a flow, tenant, or route/i)
})

test('Phase 0 documentation requires canonical ingress paths before Flowise rewrites URLs', () => {
    assert.match(phaseZeroDocumentationSource, /sanitizeMiddleware/)
    assert.match(phaseZeroDocumentationSource, /decodeURI/)
    assert.match(phaseZeroDocumentationSource, /reject any path that is not already canonical/i)
})

test('Phase 0 documentation limits its repository-secret finding to repository scope', () => {
    assert.match(phaseZeroDocumentationSource, /does not establish the absence of organization-level or environment-level\s+secrets/i)
})

test('Phase 0 documentation records Flowise default-open execution and export-import as authorization boundaries', () => {
    assert.match(phaseZeroDocumentationSource, /default-open execution/i)
    assert.match(phaseZeroDocumentationSource, /\/api\/v1\/export-import/)
})

test('Phase 0 documentation names unauthenticated lead reads and vector-upsert as ingress risks', () => {
    assert.match(phaseZeroDocumentationSource, /unauthenticated[\s\S]*lead[\s\S]*read[\s\S]*PII/i)
    assert.match(phaseZeroDocumentationSource, /unauthenticated[\s\S]*vector[\s\S]*upsert[\s\S]*prompt-injection/i)
})

test('Phase 0 documentation defers the Flowise end-user embed surface to Atlas-owned UX', () => {
    assert.match(phaseZeroDocumentationSource, /Flowise embed/i)
    assert.match(phaseZeroDocumentationSource, /Atlas-owned end-user experience/i)
})

test('Phase 0 documentation accurately scopes inherited Flowise pull-request triggers', () => {
    assert.match(phaseZeroDocumentationSource, /only when the base branch name contains no slash/i)
    assert.match(atlasUpstreamSource, /only when the base branch name contains no slash/i)
})

test('adapter README identifies adapter.js as the limited static-tripwire scope', () => {
    assert.match(adapterReadmeSource, /static tripwire is limited\s+to `adapter\.js`/)
})

test('non-production adapter has an explicit dependency-free, no-I/O boundary', () => {
    assertAdapterSourcesAreSafe()
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

test('runtime source collection includes Dockerfiles for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        fs.writeFileSync(path.join(fixtureDirectory, 'Dockerfile'), 'COPY atlas/agentflow-adapter /boundary\n')

        assert.deepEqual(
            collectRuntimeSources(fixtureDirectory, fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['Dockerfile']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection rejects a symbolic link instead of silently skipping it', () => {
    const originalReadDirectory = fs.readdirSync
    const symbolicLink = {
        name: 'adapter-link.js',
        isDirectory: () => false,
        isFile: () => false
    }

    try {
        fs.readdirSync = () => [symbolicLink]

        assert.throws(() => collectRuntimeSources('runtime-directory'), /Unsupported adapter boundary entry/)
    } finally {
        fs.readdirSync = originalReadDirectory
    }
})

test('adapter directory collector rejects unsupported entries such as symbolic links', () => {
    const unsupportedEntry = {
        isDirectory: () => false,
        isFile: () => false
    }

    assert.throws(() => assertSupportedDirectoryEntry(unsupportedEntry, 'credential-link'), /Unsupported adapter boundary entry/)
})

test('adapter source loader rejects unexpected entries before reading their contents', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))
    const originalReadFileSync = fs.readFileSync
    const readPaths = []

    try {
        for (const file of adapterBoundaryFiles) {
            fs.writeFileSync(path.join(fixtureDirectory, file), "'use strict'\n")
        }
        fs.writeFileSync(path.join(fixtureDirectory, '.env'), 'ATLAS_TOKEN=must-not-be-read\n')
        fs.readFileSync = (filePath, ...arguments_) => {
            readPaths.push(path.resolve(filePath))
            return originalReadFileSync(filePath, ...arguments_)
        }

        assert.throws(() => readAdapterSourceFiles(fixtureDirectory), /Unexpected adapter boundary entries/)
        assert.deepEqual(readPaths, [])
    } finally {
        fs.readFileSync = originalReadFileSync
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
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

test('no-I/O boundary check rejects computed CommonJS runtime loading', () => {
    assert.match("module['constructor']['_load']('node:' + 'fs').readFileSync('sensitive-file')", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects a computed CommonJS loader after direct constructor access', () => {
    assert.match("module.constructor['_load']('node:fs').readFileSync('sensitive-file')", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects module require capability loading', () => {
    assert.match("module.require('node:fs').readFileSync('sensitive-file')", prohibitedRuntimeAccess)
})

test('adapter boundary workflow is push-only, read-only, and has no configured secret references', () => {
    assert.match(adapterWorkflowSource, /^on:\n\s{4}push:$/m)
    assert.doesNotMatch(adapterWorkflowSource, /^\s{4}pull_request(?:_target)?:/m)
    assert.match(adapterWorkflowSource, /^permissions:\n\s{4}contents: read$/m)
    assert.doesNotMatch(adapterWorkflowSource, /\bsecrets\b/i)
    assert.match(adapterWorkflowSource, /persist-credentials: false/)
    assert.match(adapterWorkflowSource, /actions\/checkout@[0-9a-f]{40}/)
    assert.match(adapterWorkflowSource, /actions\/setup-node@[0-9a-f]{40}/)
    assert.match(adapterWorkflowSource, /node --test atlas\/agentflow-adapter\/adapter\.test\.js/)
})

test('Phase 0 documentation gates inherited CI for un-slashed PR bases and main merges', () => {
    assert.match(phaseZeroDocumentationSource, /do not target an un-slashed branch or merge this branch to `main`/i)
})

test('Phase 0 documentation permits review only against the slash-containing pinned baseline', () => {
    assert.match(phaseZeroDocumentationSource, /review only against the\s+slash-containing pinned baseline/i)
})

test('Phase 0 documentation records inherited Flowise CI triggers for slash-free PR bases and main pushes', () => {
    assert.match(phaseZeroDocumentationSource, /pull requests only when the base branch name contains no slash/i)
    assert.match(atlasUpstreamSource, /pull requests only when the base branch name contains no slash/i)
})

test('Phase 0 documentation accurately describes the separate Dockerfile build context', () => {
    assert.doesNotMatch(phaseZeroDocumentationSource, /docker\/Dockerfile`, which does not copy the repository context/)
})

test('Phase 0 documentation does not preserve a stale contract-test count', () => {
    assert.doesNotMatch(phaseZeroDocumentationSource, /# \d+ pass, \d+ fail/)
})

test('Phase 0 documentation uses the same explicit adapter test command as CI', () => {
    assert.match(phaseZeroDocumentationSource, /node --test atlas\/agentflow-adapter\/adapter\.test\.js/)
    assert.doesNotMatch(phaseZeroDocumentationSource, /node --test atlas\/agentflow-adapter\/\*\.test\.js/)
})

test('Phase 0 documentation defers tenancy, erasure, resource, and queue containment decisions', () => {
    assert.match(phaseZeroDocumentationSource, /shared Flowise instance/i)
    assert.match(phaseZeroDocumentationSource, /erasure/i)
    assert.match(phaseZeroDocumentationSource, /backup/i)
    assert.match(phaseZeroDocumentationSource, /resource exhaustion/i)
    assert.match(phaseZeroDocumentationSource, /queue mode/i)
})

test('Phase 0 documentation defers persistent-state placement and end-user output rendering decisions', () => {
    assert.match(phaseZeroDocumentationSource, /must not be co-located with or share credentials with any Atlas\s+datastore/i)
    assert.match(phaseZeroDocumentationSource, /end-user output contract/i)
    assert.match(phaseZeroDocumentationSource, /no verbatim relay of\s+Flowise errors/i)
})

test('root container build context excludes the non-production adapter', () => {
    assertDockerIgnoreExcludesAtlasDirectory(dockerIgnoreSource)
})

test('root container build exclusion rejects globbed atlas re-includes', () => {
    assert.throws(() => assertDockerIgnoreExcludesAtlasDirectory('atlas/\n!**/atlas/**\n'), /must not re-include atlas/i)
    assert.throws(() => assertDockerIgnoreExcludesAtlasDirectory('atlas/\n!atlas*\n'), /must not re-include atlas/i)
})

test('Flowise runtime sources do not import, require, or reference the non-production adapter', () => {
    assertFlowiseRuntimeDoesNotReferenceAdapter()
})

test('Flowise workflow sources cannot couple inherited CI to the non-production adapter', () => {
    assert.throws(
        () =>
            assertFlowiseRuntimeDoesNotReferenceAdapter([
                { name: 'main.yml', source: 'node --test atlas/agentflow-adapter/adapter.test.js' }
            ]),
        /main.yml/
    )
})

test('Flowise containment scan includes all GitHub control sources, not only workflow files', () => {
    assert.ok(flowiseRuntimeDirectories.some((directory) => directory.endsWith(`${path.sep}.github`)))
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
