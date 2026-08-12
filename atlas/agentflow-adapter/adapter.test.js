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

function assertAtlasPhaseZeroDirectory(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    const entryNames = entries.map(({ name }) => name).sort()

    assert.deepEqual(entryNames, ['agentflow-adapter'], 'Unexpected Phase 0 Atlas boundary entries')
    assert.ok(entries[0].isDirectory(), 'The Phase 0 Atlas boundary entry must be a directory.')
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

assertAtlasPhaseZeroDirectory(path.join(__dirname, '..'))

const adapterDirectoryEntries = readAdapterSourceFiles(__dirname)
const adapterSources = adapterDirectoryEntries.filter(({ name }) => name === 'adapter.js')
const adapterWorkflowSource = fs
    .readFileSync(path.join(__dirname, '../../.github/workflows/atlas-agentflow-adapter.yml'), 'utf8')
    .replace(/\r\n/g, '\n')
const pnpmWorkspaceSource = fs.readFileSync(path.join(__dirname, '../../pnpm-workspace.yaml'), 'utf8')
const rootPackageSource = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
const turboSource = fs.readFileSync(path.join(__dirname, '../../turbo.json'), 'utf8')

const dockerIgnoreSource = fs.readFileSync(path.join(__dirname, '../../.dockerignore'), 'utf8')
const flowiseRuntimeRootDirectory = path.join(__dirname, '../..')
const rootFlowiseRuntimeIgnoredDirectories = ['atlas', 'docs']
const nestedFlowiseRuntimeIgnoredDirectories = ['.git', '.turbo', 'node_modules']
const atlasAdapterWorkflowName = 'atlas-agentflow-adapter.yml'
const expectedAdapterWorkflowSource = [
    'name: Atlas AgentFlow Adapter Boundary',
    '',
    'on:',
    '    push:',
    '        branches:',
    '            - atlas/pinned-flowise-2.2.7',
    '    pull_request:',
    '        branches:',
    '            - atlas/pinned-flowise-2.2.7',
    '',
    'permissions:',
    '    contents: read',
    '',
    'jobs:',
    '    adapter-contract:',
    '        name: Disabled adapter contract',
    '        runs-on: ubuntu-latest',
    '        timeout-minutes: 5',
    '        steps:',
    '            - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4',
    '              with:',
    '                  persist-credentials: false',
    '            - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4',
    '              with:',
    '                  node-version: 20',
    '            - run: node --test atlas/agentflow-adapter/adapter.test.js'
].join('\n')

const prohibitedRuntimeAccess =
    /\b(?:require|import|process|global|globalThis|console|WebSocket|EventSource|XMLHttpRequest|navigator|Bun|Deno|Reflect|arguments|__filename|__dirname)\b|\.\s*constructor\b|\[\s*["'`]constructor["'`]\s*\]|\[\s*["'`]con["'`]\s*\+\s*["'`]structor["'`]\s*\]|\bconstructor\s*:|\b(?:eval|Function|fetch)\b|\bmodule(?!\.exports\b)|\b(?:fs|http|https|net|tls|child_process)\s*\./
const expectedAdapterSource = [
    "'use strict'",
    '',
    "const DISABLED_CODE = 'ATLAS_AGENTFLOW_ADAPTER_DISABLED'",
    'const NON_PRODUCTION_ADAPTER_DEPENDENCIES = Object.freeze([])',
    '',
    'class NonProductionAdapterError extends Error {',
    '    constructor(operation) {',
    "        super('The Atlas AgentFlow adapter is a non-production boundary skeleton and is disabled.')",
    "        this.name = 'NonProductionAdapterError'",
    '        this.code = DISABLED_CODE',
    '        this.operation = operation',
    '    }',
    '}',
    '',
    'function createNonProductionAdapter() {',
    '    const rejectDisabled = (operation) => async () => {',
    '        throw new NonProductionAdapterError(operation)',
    '    }',
    '',
    '    return Object.freeze({',
    '        enabled: false,',
    "        run: rejectDisabled('run'),",
    "        abort: rejectDisabled('abort')",
    '    })',
    '}',
    '',
    'module.exports = {',
    '    createNonProductionAdapter,',
    '    NonProductionAdapterError,',
    '    NON_PRODUCTION_ADAPTER_DEPENDENCIES',
    '}',
    ''
].join('\n')

function assertAdapterSourcesAreSafe() {
    assert.deepEqual(adapterDirectoryEntries.map(({ name }) => name).sort(), ['README.md', 'adapter.js', 'adapter.test.js'])

    for (const { source } of adapterSources) {
        assert.equal(
            source.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)),
            expectedAdapterSource,
            'Adapter source must remain the sealed Phase 0 skeleton.'
        )
        assert.doesNotMatch(source, prohibitedRuntimeAccess)
    }
}

function assertAdapterWorkflowIsContained(source) {
    assert.equal(source.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)).trim(), expectedAdapterWorkflowSource)
}

const runtimeSourceExtensions = new Set([
    '.bat',
    '.cjs',
    '.cmd',
    '.cts',
    '.html',
    '.js',
    '.json',
    '.jsx',
    '.mjs',
    '.mts',
    '.ps1',
    '.py',
    '.sh',
    '.toml',
    '.ts',
    '.tsx',
    '.vue',
    '.yaml',
    '.yml'
])

function collectRuntimeSources(directory, rootDirectory = directory) {
    const sourceFiles = []

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)

        if (!entry.isDirectory() && !entry.isFile()) {
            throw new Error(`Unsupported runtime source entry: ${entryPath}`)
        }

        const extension = path.extname(entry.name).toLowerCase()
        const normalizedEntryName = entry.name.toLowerCase()
        const entryParent = path.relative(rootDirectory, path.dirname(entryPath))
        const normalizedEntryParent = entryParent.toLowerCase()
        const normalizedRootName = path.basename(rootDirectory).toLowerCase()
        const isBinEntryScript = normalizedEntryParent.split(path.sep).includes('bin') && (extension === '' || extension === '.cmd')
        const isHuskyHook =
            (normalizedEntryParent === '.husky' || (normalizedRootName === '.husky' && normalizedEntryParent === '')) && extension === ''

        const entryRelativePath = path.relative(rootDirectory, entryPath)
        const isIgnoredRootDirectory = entryRelativePath === entry.name && rootFlowiseRuntimeIgnoredDirectories.includes(entry.name)
        const isIgnoredNestedDirectory = nestedFlowiseRuntimeIgnoredDirectories.includes(entry.name)

        if (entry.isDirectory() && !isIgnoredRootDirectory && !isIgnoredNestedDirectory) {
            sourceFiles.push(...collectRuntimeSources(entryPath, rootDirectory))
        } else if (
            entry.isFile() &&
            (normalizedEntryName === 'containerfile' ||
                normalizedEntryName.startsWith('containerfile.') ||
                normalizedEntryName.startsWith('containerfile-') ||
                normalizedEntryName.endsWith('.containerfile') ||
                normalizedEntryName === 'dockerfile' ||
                normalizedEntryName.startsWith('dockerfile.') ||
                normalizedEntryName.startsWith('dockerfile-') ||
                normalizedEntryName.endsWith('.dockerfile') ||
                normalizedEntryName === 'makefile' ||
                normalizedEntryName === 'gnumakefile' ||
                normalizedEntryName.startsWith('makefile.') ||
                normalizedEntryName.startsWith('makefile-') ||
                normalizedEntryName.startsWith('gnumakefile.') ||
                normalizedEntryName.startsWith('gnumakefile-') ||
                normalizedEntryName.endsWith('.makefile') ||
                runtimeSourceExtensions.has(extension) ||
                isBinEntryScript ||
                isHuskyHook)
        ) {
            sourceFiles.push({
                name: path.relative(rootDirectory, entryPath).split(path.sep).join('/'),
                source: fs.readFileSync(entryPath, 'utf8')
            })
        }
    }

    return sourceFiles
}

function collectFlowiseRuntimeSources(rootDirectory = flowiseRuntimeRootDirectory) {
    return collectRuntimeSources(rootDirectory, rootDirectory).filter(
        ({ name }) => name !== `.github/workflows/${atlasAdapterWorkflowName}`
    )
}

const atlasAdapterReference =
    /agentflow-adapter\b|@atlas[\\/]|\b(?:require|import)\s*\(\s*["'`]atlas(?=["'`])|\bimport\s+["'`]atlas(?=["'`])|(?:^|[\s"'`])(?:\.{1,2}[\\/])+atlas(?:[\\/]|["'`])|\b(?:require|import)\s*\(\s*["'`][^"'`]*[\\/]atlas(?:[\\/]|["'`])|\bimport\s+["'`][^"'`]*[\\/]atlas(?:[\\/]|["'`])|(?:^|[\s"'`])\/atlas(?:[\\/]|["'`])|\b(?:COPY|ADD)\s+(?:(?:\.{1,2})?[\\/])?atlas(?:[\\/\s"'`]|$)|\b(?:COPY|ADD)\s*\[\s*["'`]atlas["'`]|\bcp\s+(?:-[A-Za-z]+\s+)*(?:(?:\.{1,2})?[\\/])?atlas(?:[\\/\s"'`]|$)|\bworking-directory\s*:\s*(?:\.[\\/])?atlas(?:[\\/\s#]|$)/im

function assertRuntimeSourceDoesNotReferenceAdapter(name, source) {
    assert.equal(atlasAdapterReference.test(source), false, `Flowise runtime source references the adapter: ${name}`)
}

function assertFlowiseRuntimeDoesNotReferenceAdapter(runtimeSources = collectFlowiseRuntimeSources()) {
    for (const { name, source } of runtimeSources) {
        assertRuntimeSourceDoesNotReferenceAdapter(name, source)
    }
}

test('Flowise containment failures identify the file without exposing its contents', () => {
    assert.throws(
        () => assertRuntimeSourceDoesNotReferenceAdapter('runtime.js', 'const secret = "do-not-log"\nrequire("../../atlas/bridge")'),
        (error) => {
            assert.match(error.message, /runtime\.js/)
            assert.doesNotMatch(error.message, /do-not-log/)
            return true
        }
    )
})

function assertDockerIgnoreExcludesAtlasDirectory(source) {
    const patterns = source
        .split(String.fromCharCode(10))
        .map((line) => line.trim())
        .filter(Boolean)
    const phaseZeroBuildExcludedPaths = ['.git', '.github/workflows/atlas-agentflow-adapter.yml', 'ATLAS_UPSTREAM.md', 'atlas/', 'docs/']

    for (const excludedPath of phaseZeroBuildExcludedPaths) {
        assert.ok(patterns.includes(excludedPath), `The root Docker build must exclude ${excludedPath}.`)
    }

    for (const pattern of patterns.filter((line) => line.startsWith('!'))) {
        assert.fail(`Docker ignore rules must not re-include Phase 0 reconnaissance artifacts: ${pattern}`)
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
        assert.doesNotMatch(source, /@atlas[\\/]|(?:^|[\s"'`])(?:\.{1,2}[\\/])*atlas(?:[\\/]|-agentflow-adapter\b|["'\s]|$)/im, name)
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

test('non-production adapter has an explicit dependency-free, no-I/O boundary', () => {
    assertAdapterSourcesAreSafe()
})

test('runtime source collection includes PowerShell scripts for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        fs.writeFileSync(path.join(fixtureDirectory, 'deploy.ps1'), 'Copy-Item atlas/agentflow-adapter destination\n')

        assert.deepEqual(
            collectRuntimeSources(fixtureDirectory, fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['deploy.ps1']
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

test('runtime source collection includes common build and runtime source types for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        fs.writeFileSync(path.join(fixtureDirectory, 'Makefile'), 'node atlas/agentflow-adapter/adapter.js\n')
        fs.writeFileSync(path.join(fixtureDirectory, 'deploy.py'), 'import atlas.agentflow_adapter\n')
        fs.writeFileSync(path.join(fixtureDirectory, 'runtime.mts'), "import '../../atlas/agentflow-adapter'\n")

        assert.deepEqual(
            collectRuntimeSources(fixtureDirectory, fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['Makefile', 'deploy.py', 'runtime.mts']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection includes extensionless and Windows bin entry scripts for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        const binDirectory = path.join(fixtureDirectory, 'bin')
        fs.mkdirSync(binDirectory)
        fs.writeFileSync(path.join(binDirectory, 'run'), "#!/usr/bin/env node\nrequire('../../atlas/agentflow-adapter/adapter')\n")
        fs.writeFileSync(path.join(binDirectory, 'run.cmd'), '@echo off\n')
        fs.writeFileSync(path.join(fixtureDirectory, 'README'), 'must-not-be-read\n')

        assert.deepEqual(
            collectRuntimeSources(fixtureDirectory, fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['bin/run', 'bin/run.cmd']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection includes nested extensionless bin entry scripts for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))
    const nestedBinDirectory = path.join(fixtureDirectory, 'packages', 'server', 'bin')

    try {
        fs.mkdirSync(nestedBinDirectory, { recursive: true })
        fs.writeFileSync(
            path.join(nestedBinDirectory, 'run'),
            "#!/usr/bin/env node\nrequire('../../../../atlas/agentflow-adapter/adapter')\n"
        )
        fs.writeFileSync(
            path.join(nestedBinDirectory, 'dev'),
            "#!/usr/bin/env node\nrequire('../../../../atlas/agentflow-adapter/adapter')\n"
        )

        assert.deepEqual(
            collectRuntimeSources(fixtureDirectory, fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['packages/server/bin/dev', 'packages/server/bin/run']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection includes case-varied bin and Husky entry scripts for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        const binDirectory = path.join(fixtureDirectory, 'Bin')
        const huskyDirectory = path.join(fixtureDirectory, '.Husky')
        fs.mkdirSync(binDirectory)
        fs.mkdirSync(huskyDirectory)
        fs.writeFileSync(path.join(binDirectory, 'run'), "#!/usr/bin/env node\nrequire('../../atlas/agentflow-adapter/adapter')\n")
        fs.writeFileSync(path.join(huskyDirectory, 'pre-commit'), '#!/usr/bin/env sh\nnode atlas/agentflow-adapter/adapter.js\n')

        assert.deepEqual(
            collectRuntimeSources(fixtureDirectory, fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['.Husky/pre-commit', 'Bin/run']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection includes extensionless commit hooks for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        const huskyDirectory = path.join(fixtureDirectory, '.husky')
        fs.mkdirSync(huskyDirectory)
        fs.writeFileSync(path.join(huskyDirectory, 'pre-commit'), '#!/usr/bin/env sh\nnode atlas/agentflow-adapter/adapter.js\n')

        assert.deepEqual(
            collectRuntimeSources(fixtureDirectory, fixtureDirectory)
                .map(({ name }) => name)
                .sort(),
            ['.husky/pre-commit']
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection includes extensionless commit hooks when the Husky directory is the scan root', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))
    const huskyDirectory = path.join(fixtureDirectory, '.husky')

    try {
        fs.mkdirSync(huskyDirectory)
        fs.writeFileSync(path.join(huskyDirectory, 'pre-commit'), '#!/usr/bin/env sh\nnode atlas/agentflow-adapter/adapter.js\n')

        assert.deepEqual(
            collectRuntimeSources(huskyDirectory, huskyDirectory)
                .map(({ name }) => name)
                .sort(),
            ['pre-commit']
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

test('runtime source collection includes mixed-case runtime extensions for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        const sourceByName = {
            'bridge.JS': "require('../../atlas/agentflow-adapter')\n",
            'runtime.Ts': "require('../../atlas/agentflow-adapter')\n",
            'workflow.YAML': 'COPY atlas/agentflow-adapter /boundary\n'
        }

        for (const [name, source] of Object.entries(sourceByName)) {
            fs.writeFileSync(path.join(fixtureDirectory, name), source)
        }

        const runtimeSources = collectRuntimeSources(fixtureDirectory, fixtureDirectory)

        assert.deepEqual(runtimeSources.map(({ name }) => name).sort(), Object.keys(sourceByName).sort())
        assert.throws(() => assertFlowiseRuntimeDoesNotReferenceAdapter(runtimeSources))
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection includes Dockerfile variants and CommonJS TypeScript for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        const sourceByName = {
            Containerfile: 'COPY atlas/agentflow-adapter /boundary\n',
            'Containerfile-prod': 'COPY atlas/agentflow-adapter /boundary\n',
            'Containerfile.prod': 'COPY atlas/agentflow-adapter /boundary\n',
            'Dockerfile-prod': 'COPY atlas/agentflow-adapter /boundary\n',
            'Dockerfile.prod': 'COPY atlas/agentflow-adapter /boundary\n',
            'worker.Dockerfile': 'COPY atlas/agentflow-adapter /boundary\n',
            'runtime.cts': "require('../../atlas/agentflow-adapter')\n"
        }

        for (const [name, source] of Object.entries(sourceByName)) {
            fs.writeFileSync(path.join(fixtureDirectory, name), source)
        }

        const runtimeSources = collectRuntimeSources(fixtureDirectory, fixtureDirectory)

        assert.deepEqual(runtimeSources.map(({ name }) => name).sort(), Object.keys(sourceByName).sort())
        assert.throws(() => assertFlowiseRuntimeDoesNotReferenceAdapter(runtimeSources))
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection includes case and naming variants of Makefiles for adapter-reference scanning', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))

    try {
        const sourceByName = {
            makefile: 'COPY atlas/agentflow-adapter /boundary\n',
            GNUmakefile: 'COPY atlas/agentflow-adapter /boundary\n',
            'GNUmakefile.prod': 'COPY atlas/agentflow-adapter /boundary\n',
            'Makefile.prod': 'COPY atlas/agentflow-adapter /boundary\n',
            'production.makefile': 'COPY atlas/agentflow-adapter /boundary\n'
        }

        for (const [name, source] of Object.entries(sourceByName)) {
            fs.writeFileSync(path.join(fixtureDirectory, name), source)
        }

        const runtimeSources = collectRuntimeSources(fixtureDirectory, fixtureDirectory)

        assert.deepEqual(runtimeSources.map(({ name }) => name).sort(), Object.keys(sourceByName).sort())
        assert.throws(() => assertFlowiseRuntimeDoesNotReferenceAdapter(runtimeSources))
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('runtime source collection rejects a symbolic link outside the sealed adapter boundary', () => {
    const originalReadDirectory = fs.readdirSync
    const symbolicLink = {
        name: 'adapter-link.js',
        isDirectory: () => false,
        isFile: () => false
    }

    try {
        fs.readdirSync = () => [symbolicLink]

        assert.throws(() => collectRuntimeSources('runtime-directory'), /Unsupported runtime source entry/)
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

test('no-I/O boundary check rejects indirect global environment access', () => {
    assert.match("global['pro' + 'cess'].env.ATLAS_TOKEN", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects reflective CommonJS capability loading', () => {
    assert.match("Reflect.get(module, 'req' + 'uire')('node:fs').readFileSync('sensitive-file')", prohibitedRuntimeAccess)
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

test('no-I/O boundary check rejects a single function constructor escape', () => {
    assert.match("(() => {}).constructor('return pro' + 'cess')()", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects a computed function constructor escape', () => {
    assert.match("const F = (() => {})['constructor']['constructor']; F('return pro' + 'cess')()", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects synthesized function constructor property names', () => {
    assert.match(
        "Object.getPrototypeOf(async () => {})['con' + 'structor'](\"return pro\" + \"cess.mainModule['req' + 'uire']('f' + 's')\")()",
        prohibitedRuntimeAccess
    )
})

test('no-I/O boundary check rejects a destructured constructor escape', () => {
    assert.match(
        "const { constructor: F } = Object.getPrototypeOf(async function () {}); F('return pro' + 'cess')().env",
        prohibitedRuntimeAccess
    )
})

test('no-I/O boundary check rejects indirect CommonJS runtime loading', () => {
    assert.match("module.constructor._load('node:fs').readFileSync('sensitive-file')", prohibitedRuntimeAccess)
})

test('no-I/O boundary check rejects CommonJS wrapper capability escapes', () => {
    assert.match("arguments[1]('node:' + 'fs').readFileSync('sensitive-file')", prohibitedRuntimeAccess)
    assert.match("const F = (() => {}).constructor.constructor; F('return pro' + 'cess.env')()", prohibitedRuntimeAccess)
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

test('adapter boundary workflow has the sole explicitly contained job and steps', () => {
    assertAdapterWorkflowIsContained(adapterWorkflowSource)
})

test('adapter boundary workflow rejects an added job-level privilege', () => {
    const elevatedWorkflow = adapterWorkflowSource.replace(
        '        timeout-minutes: 5',
        '        timeout-minutes: 5\n        permissions:\n            contents: write\n            id-token: write'
    )

    assert.throws(() => assertAdapterWorkflowIsContained(elevatedWorkflow))
})

test('adapter boundary workflow rejects an added network-capable step', () => {
    const expandedWorkflow = `${adapterWorkflowSource}\n            - run: pnpm install`

    assert.throws(() => assertAdapterWorkflowIsContained(expandedWorkflow))
})

test('root container build context excludes the non-production adapter', () => {
    assertDockerIgnoreExcludesAtlasDirectory(dockerIgnoreSource)
})

test('root container build exclusion requires Phase 0 reconnaissance artifacts to remain out of the image', () => {
    assert.throws(
        () => assertDockerIgnoreExcludesAtlasDirectory('.git\n.github/workflows/atlas-agentflow-adapter.yml\natlas/\n'),
        /must exclude ATLAS_UPSTREAM/i
    )
})

test('root container build exclusion prevents Git objects from carrying the Phase 0 boundary into the image', () => {
    assert.throws(
        () => assertDockerIgnoreExcludesAtlasDirectory('.github/workflows/atlas-agentflow-adapter.yml\nATLAS_UPSTREAM.md\natlas/\ndocs/\n'),
        /must exclude \.git/i
    )
})

test('root container build exclusion rejects globbed atlas re-includes', () => {
    const requiredExclusions = '.git\n.github/workflows/atlas-agentflow-adapter.yml\nATLAS_UPSTREAM.md\natlas/\ndocs/\n'

    assert.throws(
        () => assertDockerIgnoreExcludesAtlasDirectory(`${requiredExclusions}!**/atlas/**\n`),
        /must not re-include Phase 0 reconnaissance artifacts/i
    )
    assert.throws(
        () => assertDockerIgnoreExcludesAtlasDirectory(`${requiredExclusions}!atlas*\n`),
        /must not re-include Phase 0 reconnaissance artifacts/i
    )
    assert.throws(
        () => assertDockerIgnoreExcludesAtlasDirectory(`${requiredExclusions}!**/agentflow-adapter/**\n`),
        /must not re-include Phase 0 reconnaissance artifacts/i
    )
})

test('root container build exclusion rejects broad negations that could re-include Phase 0 artifacts', () => {
    const requiredExclusions = '.git\n.github/workflows/atlas-agentflow-adapter.yml\nATLAS_UPSTREAM.md\natlas/\ndocs/\n'

    for (const negation of ['!**', '!*']) {
        assert.throws(
            () => assertDockerIgnoreExcludesAtlasDirectory(`${requiredExclusions}${negation}\n`),
            /must not re-include Phase 0 reconnaissance artifacts/i
        )
    }
})

test('Flowise containment discovery scans new top-level runtime directories', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))
    const runtimeDirectory = path.join(fixtureDirectory, 'new-runtime')

    try {
        fs.mkdirSync(runtimeDirectory)
        fs.writeFileSync(path.join(runtimeDirectory, 'deploy.ps1'), 'Copy-Item atlas/agentflow-adapter destination\n')

        assert.ok(
            collectFlowiseRuntimeSources(fixtureDirectory).some(({ name }) => name === 'new-runtime/deploy.ps1'),
            'New top-level runtime directories must be included in containment scanning.'
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('Flowise containment discovery scans runtime artifacts in nested build and dist directories', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))
    const runtimeDirectories = ['build', 'dist'].map((directory) => path.join(fixtureDirectory, 'new-runtime', directory))

    try {
        for (const runtimeDirectory of runtimeDirectories) {
            fs.mkdirSync(runtimeDirectory, { recursive: true })
            fs.writeFileSync(path.join(runtimeDirectory, 'bridge.js'), "require('../../atlas/agentflow-adapter')\n")
        }

        const runtimeSourceNames = collectFlowiseRuntimeSources(fixtureDirectory).map(({ name }) => name)
        assert.ok(
            runtimeSourceNames.includes('new-runtime/build/bridge.js'),
            'Nested build artifacts must be included in containment scanning.'
        )
        assert.ok(
            runtimeSourceNames.includes('new-runtime/dist/bridge.js'),
            'Nested dist artifacts must be included in containment scanning.'
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('Flowise containment discovery scans nested Atlas-named runtime directories', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adapter-boundary-'))
    const runtimeDirectory = path.join(fixtureDirectory, 'packages', 'server', 'src', 'atlas')

    try {
        fs.mkdirSync(runtimeDirectory, { recursive: true })
        fs.writeFileSync(path.join(runtimeDirectory, 'bridge.js'), "require('../../../../atlas/agentflow-adapter')\n")

        assert.ok(
            collectFlowiseRuntimeSources(fixtureDirectory).some(({ name }) => name === 'packages/server/src/atlas/bridge.js'),
            'Nested Atlas-named runtime directories must be included in containment scanning.'
        )
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
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

test('Flowise runtime sources cannot import a future Atlas sibling module', () => {
    assert.throws(
        () => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'runtime.js', source: "require('../../atlas/bridge')" }]),
        /runtime.js/
    )
})

test('Flowise runtime sources cannot import an Atlas module nested below another sibling', () => {
    assert.throws(
        () => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'runtime.js', source: "require('../services/atlas/bridge')" }]),
        /runtime.js/
    )
})

test('Flowise runtime sources cannot dynamically or side-effect import a future Atlas sibling module', () => {
    for (const source of [
        "import('../../atlas/bridge')",
        "import '../../atlas/bridge'",
        'import(`../../atlas/bridge`)',
        'require(`../../atlas/bridge`)'
    ]) {
        assert.throws(() => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'runtime.js', source }]), /runtime.js/)
    }
})

test('Flowise runtime sources cannot reference a bare or case-varied Atlas entry point', () => {
    assert.throws(
        () => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'runtime.js', source: "require('../../atlas')" }]),
        /runtime.js/
    )
    assert.throws(
        () => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'runtime.js', source: "require('../../Atlas/bridge')" }]),
        /runtime.js/
    )
})

test('Flowise runtime sources cannot copy the Atlas directory outside the adapter workflow', () => {
    for (const source of [
        'COPY atlas/ /usr/src/atlas/',
        'COPY atlas /usr/src/atlas',
        'COPY ./atlas /app',
        'COPY ["atlas", "/app"]',
        'RUN cp -r atlas dist'
    ]) {
        assert.throws(() => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'Dockerfile', source }]), /Dockerfile/)
    }
})

test('Flowise workflow sources cannot set the Atlas directory as a working directory', () => {
    assert.throws(
        () => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'workflow.yml', source: 'working-directory: atlas' }]),
        /workflow.yml/
    )
})

test('Flowise runtime sources cannot import a scoped Atlas package', () => {
    assert.throws(
        () => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'runtime.js', source: "require('@atlas/bridge')" }]),
        /runtime.js/
    )
})

test('Flowise runtime sources cannot import Atlas through bare or absolute module paths', () => {
    for (const source of ["require('atlas')", "require('/atlas/bridge')"]) {
        assert.throws(() => assertFlowiseRuntimeDoesNotReferenceAdapter([{ name: 'runtime.js', source }]), /runtime.js/)
    }
})

test('Flowise containment scan includes established runtime and control surfaces', () => {
    const sourceNames = new Set(collectFlowiseRuntimeSources().map(({ name }) => name))

    for (const sourceName of ['.github/workflows/main.yml', '.husky/pre-commit', 'Dockerfile', 'metrics/otel/compose.yaml']) {
        assert.ok(sourceNames.has(sourceName), `${sourceName} must be included in containment scanning.`)
    }
})

test('Phase 0 Atlas boundary rejects an additional transport directory', () => {
    const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-phase-zero-'))

    try {
        fs.mkdirSync(path.join(fixtureDirectory, 'agentflow-adapter'))
        fs.mkdirSync(path.join(fixtureDirectory, 'transport'))

        assert.throws(() => assertAtlasPhaseZeroDirectory(fixtureDirectory), /transport/)
    } finally {
        fs.rmSync(fixtureDirectory, { recursive: true, force: true })
    }
})

test('Flowise build-graph guard rejects a bare atlas workspace entry', () => {
    assert.throws(
        () => assertFlowiseBuildGraphDoesNotReferenceAdapter([['pnpm-workspace.yaml', "packages:\n  - 'atlas'"]]),
        /pnpm-workspace.yaml/
    )
})

test('Flowise build-graph guard rejects a scoped Atlas workspace dependency', () => {
    assert.throws(
        () => assertFlowiseBuildGraphDoesNotReferenceAdapter([['package.json', '{"dependencies":{"@atlas/bridge":"workspace:*"}}']]),
        /package.json/
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
