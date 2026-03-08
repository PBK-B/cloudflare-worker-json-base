import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'

const promptMock = jest.fn<any>()
const spawnSyncMock = jest.fn<any>()
const chalkProxy = new Proxy({}, { get: () => (value: string) => value })

jest.mock('chalk', () => ({ __esModule: true, default: chalkProxy }))
jest.mock('inquirer', () => ({ __esModule: true, default: { prompt: promptMock } }))
jest.mock('child_process', () => ({ __esModule: true, spawnSync: (...args: unknown[]) => spawnSyncMock(...args) }))

describe('deploy-cli', () => {
  const originalEnv = process.env
  let cli: typeof import('../../../deploy-cli')
  let testing: typeof import('../../../deploy-cli').__testing
  let consoleLogSpy: ReturnType<typeof jest.spyOn>
  let processExitSpy: ReturnType<typeof jest.spyOn>

  beforeEach(async () => {
    jest.resetModules()
    process.env = { ...originalEnv }
    promptMock.mockReset()
    spawnSyncMock.mockReset()
    spawnSyncMock.mockImplementation((command: unknown, args?: unknown) => mockSpawn(String(command), (args as readonly string[] | undefined) || []))

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`)
    }) as never)

    cli = await import('../../../deploy-cli')
    testing = cli.__testing
  })

  afterEach(() => {
    process.env = originalEnv
    consoleLogSpy.mockRestore()
    processExitSpy.mockRestore()
    jest.restoreAllMocks()
  })

  it('parses TOML with nested tables and arrays', () => {
    const config = testing.parseTomlLite(`name = "worker"\n[vars]\nSTORAGE_BACKEND = "d1"\n[[d1_databases]]\nbinding = "JSONBASE_DB"\ndatabase_name = "jsonbase"\n`)

    expect(config.name).toBe('worker')
    expect((config.vars as any).STORAGE_BACKEND).toBe('d1')
    expect(Array.isArray(config.d1_databases)).toBe(true)
    expect((config.d1_databases as any[])[0].binding).toBe('JSONBASE_DB')
  })

  it('parses complex scalar arrays and inline object placeholders', () => {
    const config = testing.parseTomlLite('flags = ["a", {x=1}, [1,2]]\nobj = { a = 1 }')
    expect(config.flags).toEqual(['a', {}, [1, 2]])
    expect(config.obj).toEqual({})
  })

  it('strips JSON comments and trailing commas', () => {
    const result = testing.stripJsonComments('{\n // comment\n "a": 1,\n}')
    expect(JSON.parse(result)).toEqual({ a: 1 })
  })

  it('preserves # inside quoted TOML strings while stripping comments', () => {
    const config = testing.parseTomlLite('name = "hello # world" # trailing')
    expect(config.name).toBe('hello # world')
  })

  it('deep merges nested objects and replaces arrays', () => {
    const merged = testing.deepMerge({ vars: { A: '1' }, list: [1], top: 'a' } as any, { vars: { B: '2' }, list: [2] } as any)
    expect(merged).toEqual({ vars: { A: '1', B: '2' }, list: [2], top: 'a' })
  })

  it('parses var pair and fails on invalid format', () => {
    expect(testing.parseVarPair('A:B')).toEqual(['A', 'B'])
    expect(() => testing.parseVarPair('AB')).toThrow('process.exit:1')
  })

  it('parses env file contents', () => {
    const envPath = path.join(process.cwd(), 'tmp.deploy-cli.env')
    fs.writeFileSync(envPath, '# comment\nA=1\nB = two\n')
    try {
      expect(testing.parseEnvFile(envPath)).toEqual({ A: '1', B: 'two' })
    } finally {
      fs.unlinkSync(envPath)
    }
  })

  it('skips invalid env-file lines and trims values', () => {
    const envPath = path.join(process.cwd(), 'tmp.deploy-cli.invalid.env')
    fs.writeFileSync(envPath, 'INVALID\nEMPTY=\nNAME = value \n')
    try {
      expect(testing.parseEnvFile(envPath)).toEqual({ EMPTY: '', NAME: 'value' })
    } finally {
      fs.unlinkSync(envPath)
    }
  })

  it('generates secure API key with expected length', () => {
    const key = testing.generateSecureApiKey()
    expect(key).toHaveLength(32)
  })

  it('resolves default environment preferring development', () => {
    expect(testing.getDefaultEnvironment({ env: { production: {}, development: {} } } as any)).toBe('development')
    expect(testing.getDefaultEnvironment({ env: { production: {} } } as any)).toBe('production')
  })

  it('normalizes storage backend and missing-resource policy', () => {
    expect(testing.normalizeStorageBackend('d1')).toBe('d1')
    expect(testing.normalizeStorageBackend('x')).toBeUndefined()
    expect(testing.normalizeMissingResourcePolicy('manual')).toBe('manual')
    expect(testing.normalizeMissingResourcePolicy('x')).toBeUndefined()
  })

  it('returns false authentication state on non-zero exit status', () => {
    expect(testing.isWranglerAuthenticated({ ok: false, status: 1, stdout: '', stderr: 'failed' })).toBe(false)
  })

  it('handles helper utilities for json output and non-interactive detection', () => {
    expect(testing.toJsonc({ a: 1 } as any)).toContain('"a": 1')
    expect(testing.parseBooleanFlag(true)).toBe(true)
    expect(testing.parseBooleanFlag(false)).toBe(false)
    process.env.CI = 'true'
    expect(testing.isCiEnvironment()).toBe(true)
    expect(testing.isNonInteractiveMode({})).toBe(true)
    delete process.env.CI
    expect(testing.isNonInteractiveMode({ nonInteractive: true })).toBe(true)
    expect(testing.isNonInteractiveMode({})).toBe(false)
  })

  it('detects non-authenticated wrangler output even with zero exit code', () => {
    expect(testing.isWranglerAuthenticated({ ok: true, status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' })).toBe(false)
    expect(testing.isWranglerAuthenticated({ ok: true, status: 0, stdout: 'Logged in as demo', stderr: '' })).toBe(true)
  })

  it('detects UUID-like values', () => {
    expect(testing.looksLikeUuid('e19967df-f256-4ea7-af48-67d2d1bd0c90')).toBe(true)
    expect(testing.looksLikeUuid('jsonbase')).toBe(false)
  })

  it('rewrites config paths relative to generated config directory', () => {
    const rewritten = testing.rewriteConfigPathsForGeneratedFile({
      main: 'dist/index.js',
      assets: { directory: 'dist-webui/dash' },
      build: { watch_dir: 'src' },
      d1_databases: [{ binding: 'JSONBASE_DB', migrations_dir: 'src/database' }]
    } as any, path.join(process.cwd(), '.wrangler', 'deploy', 'generated', 'development'))

    expect(rewritten.main).toBe('../../../../dist/index.js')
    expect((rewritten.assets as any).directory).toBe('../../../../dist-webui/dash')
    expect((rewritten.build as any).watch_dir).toBe('../../../../src')
    expect((rewritten.d1_databases as any[])[0].migrations_dir).toBe('../../../../src/database')
  })

  it('keeps absolute and blank generated paths stable', () => {
    expect(testing.toGeneratedRelativePath('/tmp/demo.js', '/tmp/generated')).toBe('/tmp/demo.js')
    expect(testing.toGeneratedRelativePath('   ', '/tmp/generated')).toBe('   ')
  })

  it('returns platform-specific npx binary name', () => {
    expect(typeof testing.getNpxBin()).toBe('string')
  })

  it('resolves env config by inheriting vars and replacing non-inheritable sections', () => {
    const resolved = testing.resolveEnvConfig({
      vars: { A: '1', B: '1' },
      kv_namespaces: [{ binding: 'ROOT', id: 'root' }],
      env: {
        production: {
          vars: { B: '2', C: '3' },
          kv_namespaces: [{ binding: 'PROD', id: 'prod' }]
        }
      }
    } as any, 'production')

    expect(resolved.vars).toEqual({ A: '1', B: '2', C: '3' })
    expect(resolved.kv_namespaces).toEqual([{ binding: 'PROD', id: 'prod' }])
  })

  it('validates generated config for missing paths and invalid vars', () => {
    const errors = testing.validateGeneratedConfig({
      compatibility_date: 'bad-date',
      main: 'missing/index.js',
      assets: { directory: 'missing-assets' },
      vars: []
    } as any)

    expect(errors).toEqual(expect.arrayContaining([
      'compatibility_date 格式无效，应为 yyyy-mm-dd',
      'main 指向的文件不存在: missing/index.js',
      'assets.directory 不存在: missing-assets',
      'vars 必须是对象'
    ]))
  })

  it('returns no validation errors for an existing valid generated config', () => {
    expect(testing.validateGeneratedConfig({
      compatibility_date: '2024-05-02',
      main: 'deploy-cli.ts',
      assets: { directory: 'src' },
      vars: { A: '1' }
    } as any)).toEqual([])
  })

  it('resolves environment from explicit option, env var, prompt, and non-interactive default', async () => {
    expect(await testing.resolveEnvironment({ env: { development: {}, production: {} } } as any, { env: 'production' })).toBe('production')

    process.env.DEPLOY_ENV = 'staging'
    expect(await testing.resolveEnvironment({ env: { development: {}, production: {} } } as any, {})).toBe('staging')

    delete process.env.DEPLOY_ENV
    promptMock.mockResolvedValueOnce({ env: 'production' })
    expect(await testing.resolveEnvironment({ env: { development: {}, production: {} } } as any, {})).toBe('production')

    expect(await testing.resolveEnvironment({ env: { production: {} } } as any, { nonInteractive: true })).toBe('production')
  })

  it('resolves storage backend from option, env vars, prompt, and defaults', async () => {
    expect(await testing.resolveStorageBackend({ vars: { STORAGE_BACKEND: 'd1' } } as any, { storage: 'kv' })).toBe('kv')

    process.env.DEPLOY_STORAGE_BACKEND = 'd1'
    expect(await testing.resolveStorageBackend({ vars: { STORAGE_BACKEND: 'kv' } } as any, {})).toBe('d1')

    delete process.env.DEPLOY_STORAGE_BACKEND
    process.env.STORAGE_BACKEND = 'kv'
    expect(await testing.resolveStorageBackend({ vars: { STORAGE_BACKEND: 'd1' } } as any, {})).toBe('kv')

    delete process.env.STORAGE_BACKEND
    promptMock.mockResolvedValueOnce({ storage: 'kv' })
    expect(await testing.resolveStorageBackend({ vars: { STORAGE_BACKEND: 'd1' } } as any, {})).toBe('kv')

    expect(await testing.resolveStorageBackend({ vars: { STORAGE_BACKEND: 'd1' } } as any, { nonInteractive: true })).toBe('d1')
  })

  it('falls back to default d1 backend when nothing is configured', async () => {
    expect(await testing.resolveStorageBackend({} as any, { nonInteractive: true })).toBe('d1')
  })

  it('resolves API key from skip-secret, CLI/env overrides, non-interactive, manual input, and generation', async () => {
    expect(await testing.resolveApiKey({ skipSecret: true })).toBeUndefined()
    expect(await testing.resolveApiKey({ apiKey: '1234567890123456' })).toBe('1234567890123456')

    process.env.DEPLOY_API_KEY = 'abcdefghijklmnop'
    expect(await testing.resolveApiKey({})).toBe('abcdefghijklmnop')

    delete process.env.DEPLOY_API_KEY
    process.env.API_KEY = 'qrstuvwxyz123456'
    expect(await testing.resolveApiKey({})).toBe('qrstuvwxyz123456')

    delete process.env.API_KEY
    expect(await testing.resolveApiKey({ nonInteractive: true })).toBeUndefined()

    promptMock.mockResolvedValueOnce({ apiKey: 'manual-api-key-123' })
    expect(await testing.resolveApiKey({})).toBe('manual-api-key-123')

    promptMock.mockResolvedValueOnce({ apiKey: '' })
    promptMock.mockResolvedValueOnce({ choice: 'generate' })
    const generated = await testing.resolveApiKey({})
    expect(generated).toHaveLength(32)
  })

  it('fails when explicit API key is too short', async () => {
    await expect(testing.resolveApiKey({ apiKey: 'short' })).rejects.toThrow('process.exit:1')
  })

  it('re-prompts after invalid manual API key entry', async () => {
    promptMock.mockResolvedValueOnce({ apiKey: 'short' })
    promptMock.mockResolvedValueOnce({ apiKey: 'long-enough-api-key' })
    expect(await testing.resolveApiKey({})).toBe('long-enough-api-key')
  })

  it('uses default missing-resource, migrate, and healthcheck behavior', async () => {
    expect(await testing.resolveMissingResourcePolicy({})).toBe('ask')
    expect(await testing.resolveMissingResourcePolicy({ yes: true })).toBe('auto')
    expect(await testing.resolveSkipMigrate({ d1_databases: [{ binding: 'JSONBASE_DB' }] } as any, 'd1', {})).toBe(false)
    expect(await testing.resolveSkipMigrate({} as any, 'kv', {})).toBe(true)
    expect(await testing.resolveSkipHealthcheck({})).toBe(false)
  })

  it('prompts for missing resource action and resolves yes->auto policy', async () => {
    promptMock.mockResolvedValueOnce({ action: 'manual' })
    expect(await testing.promptMissingResourceAction('D1 JSONBASE_DB')).toBe('manual')
    expect(testing.resolveEffectiveMissingPolicy('ask', true)).toBe('auto')
    expect(testing.resolveEffectiveMissingPolicy('manual', true)).toBe('manual')
  })

  it('returns explicit missing-resource policy from env', async () => {
    process.env.DEPLOY_MISSING_RESOURCE_POLICY = 'manual'
    expect(await testing.resolveMissingResourcePolicy({})).toBe('manual')
  })

  it('resolves explicit skip flags', async () => {
    expect(await testing.resolveSkipMigrate({ d1_databases: [{ binding: 'JSONBASE_DB' }] } as any, 'd1', { skipMigrate: true })).toBe(true)
    expect(await testing.resolveSkipHealthcheck({ skipHealthcheck: true })).toBe(true)
  })

  it('reads forced resource inputs and validates backend/resource mismatches', () => {
    process.env.DEPLOY_D1_DATABASE = 'jsonbase'
    process.env.DEPLOY_KV_NAMESPACE = 'cache'
    expect(testing.getForcedD1Value({})).toBe('jsonbase')
    expect(testing.getForcedKVValue({})).toBe('cache')

    expect(() => testing.validateForcedResourceOptions('d1', { kv: 'cache' })).toThrow('process.exit:1')
    expect(() => testing.validateForcedResourceOptions('kv', { d1: 'db' })).toThrow('process.exit:1')
  })

  it('returns default D1/KV bindings and explicit R2 bindings', () => {
    expect(testing.getD1Bindings({} as any)).toEqual([{ binding: 'JSONBASE_DB', database_name: 'jsonbase' }])
    expect(testing.getKVBindings({ vars: { KV_NAMESPACE: 'JSONBIN_CUSTOM' } } as any)).toEqual([{ binding: 'JSONBIN_CUSTOM' }])
    expect(testing.getR2Bindings({ r2_buckets: [{ binding: 'FILES', bucket_name: 'files' }] } as any)).toEqual([{ binding: 'FILES', bucket_name: 'files' }])
  })

  it('uses configured d1 and kv bindings when present', () => {
    expect(testing.getD1Bindings({ d1_databases: [{ binding: 'DB', database_name: 'db-name', database_id: 'id-1' }] } as any)).toEqual([
      { binding: 'DB', database_name: 'db-name', database_id: 'id-1' }
    ])
    expect(testing.getKVBindings({ kv_namespaces: [{ binding: 'KV', id: 'id-1' }] } as any)).toEqual([{ binding: 'KV', id: 'id-1' }])
  })

  it('uses worker name fallback when missing', () => {
    expect(testing.getWorkerName({} as any)).toBe('worker')
    expect(testing.getWorkerName({ name: 'demo-worker' } as any)).toBe('demo-worker')
  })

  it('applyResolvedResources creates missing d1/kv sections from selected resources', () => {
    const applied = testing.applyResolvedResources({ vars: { STORAGE_BACKEND: 'd1' } } as any, [
      { type: 'd1', binding: 'JSONBASE_DB', id: 'db-id', name: 'jsonbase', status: 'existing' },
      { type: 'kv', binding: 'JSONBIN', id: 'kv-id', status: 'existing' }
    ])

    expect(applied.d1_databases).toEqual([{ binding: 'JSONBASE_DB', database_id: 'db-id', database_name: 'jsonbase' }])
    expect(applied.kv_namespaces).toEqual([{ binding: 'JSONBIN', id: 'kv-id', preview_id: 'kv-id' }])
  })

  it('resolves forced D1 resource from existing name', async () => {
    const resources = await testing.resolveForcedResources({ d1_databases: [{ binding: 'JSONBASE_DB', database_name: 'jsonbase' }] } as any, 'd1', { d1: 'jsonbase' })
    expect(resources).toEqual([{ type: 'd1', binding: 'JSONBASE_DB', id: 'db-jsonbase', name: 'jsonbase', status: 'existing' }])
  })

  it('creates forced D1 resource when specified name does not exist', async () => {
    const resources = await testing.resolveForcedResources({ d1_databases: [{ binding: 'JSONBASE_DB', database_name: 'jsonbase' }] } as any, 'd1', { d1: 'new-db' })
    expect(resources).toEqual([{ type: 'd1', binding: 'JSONBASE_DB', id: '123e4567-e89b-12d3-a456-426614174000', name: 'new-db', status: 'created' }])
  })

  it('returns no forced resources when nothing is specified', async () => {
    expect(await testing.resolveForcedResources({} as any, 'd1', {})).toEqual([])
  })

  it('fails forced D1 resource when unknown UUID is provided', async () => {
    await expect(testing.resolveForcedResources({ d1_databases: [{ binding: 'JSONBASE_DB', database_name: 'jsonbase' }] } as any, 'd1', { d1: '123e4567-e89b-12d3-a456-426614174000' })).rejects.toThrow('process.exit:1')
  })

  it('resolves forced KV resource from existing title and creates when missing', async () => {
    const existing = await testing.resolveForcedResources({ vars: { KV_NAMESPACE: 'JSONBIN' } } as any, 'kv', { kv: 'jsonbase' })
    expect(existing).toEqual([{ type: 'kv', binding: 'JSONBIN', id: 'kv-jsonbase', status: 'existing' }])

    const created = await testing.resolveForcedResources({ vars: { KV_NAMESPACE: 'JSONBIN' } } as any, 'kv', { kv: 'new-kv' })
    expect(created).toEqual([{ type: 'kv', binding: 'JSONBIN', id: '1234567890abcdef1234567890abcdef', status: 'created' }])
  })

  it('fails forced KV resource when unknown id is provided', async () => {
    await expect(testing.resolveForcedResources({ vars: { KV_NAMESPACE: 'JSONBIN' } } as any, 'kv', { kv: '9c9741b22ea4414cacc92ba5fc436eff' })).rejects.toThrow('process.exit:1')
  })

  it('applies resolved resources back into deploy config', () => {
    const applied = testing.applyResolvedResources({
      vars: { STORAGE_BACKEND: 'd1' },
      d1_databases: [{ binding: 'JSONBASE_DB', database_name: 'old', database_id: 'old-id' }],
      kv_namespaces: [{ binding: 'JSONBIN', id: 'old-kv' }],
      r2_buckets: [{ binding: 'FILES', bucket_name: 'old-bucket' }]
    } as any, [
      { type: 'd1', binding: 'JSONBASE_DB', id: 'new-id', name: 'new-db', status: 'existing' },
      { type: 'kv', binding: 'JSONBIN', id: 'new-kv', status: 'existing' },
      { type: 'r2', binding: 'FILES', id: 'new-bucket', status: 'existing' }
    ])

    expect((applied.d1_databases as any[])[0]).toEqual({ binding: 'JSONBASE_DB', database_name: 'new-db', database_id: 'new-id' })
    expect((applied.kv_namespaces as any[])[0]).toEqual({ binding: 'JSONBIN', id: 'new-kv' })
    expect((applied.r2_buckets as any[])[0]).toEqual({ binding: 'FILES', bucket_name: 'new-bucket' })
    expect((applied.vars as any).KV_NAMESPACE).toBe('JSONBIN')
    expect((applied.vars as any).D1_BINDING).toBe('JSONBASE_DB')
  })

  it('builds deploy args with generated config, dry-run, and keep-vars', () => {
    expect(testing.buildDeployArgs({ dryRun: true, keepVars: true }, '/tmp/generated.jsonc')).toEqual([
      'wrangler', 'deploy', '--config', '/tmp/generated.jsonc', '--dry-run', '--keep-vars'
    ])
  })

  it('creates CLI program with deploy, doctor, and print-config commands', () => {
    const program = testing.createProgram()
    const commandNames = program.commands.map((command) => command.name())
    expect(commandNames).toEqual(expect.arrayContaining(['deploy', 'doctor', 'print-config']))
  })

  it('parseConfigFile supports toml and jsonc', () => {
    const tomlPath = path.join(process.cwd(), 'tmp.deploy-cli.toml')
    const jsoncPath = path.join(process.cwd(), 'tmp.deploy-cli.jsonc')
    fs.writeFileSync(tomlPath, 'name = "demo"\n')
    fs.writeFileSync(jsoncPath, '{\n // c\n "name": "demo-json",\n}')
    try {
      expect(testing.parseConfigFile(tomlPath)).toEqual({ name: 'demo' })
      expect(testing.parseConfigFile(jsoncPath)).toEqual({ name: 'demo-json' })
    } finally {
      fs.unlinkSync(tomlPath)
      fs.unlinkSync(jsoncPath)
    }
  })

  it('getSchemaAllowList fails on malformed schema', () => {
    const schemaPath = path.join(process.cwd(), 'tmp.deploy-cli.schema.json')
    fs.writeFileSync(schemaPath, JSON.stringify({ definitions: { RawConfig: {} } }))
    try {
      expect(() => testing.getSchemaAllowList(schemaPath)).toThrow('process.exit:1')
    } finally {
      fs.unlinkSync(schemaPath)
    }
  })

  it('sanitizeConfigBySchema keeps only allowed keys', () => {
    expect(testing.sanitizeConfigBySchema({ name: 'demo', vars: {}, ignored: true } as any, new Set(['name', 'vars']))).toEqual({ name: 'demo', vars: {} })
  })

  it('checkSensitiveVars allows safe vars object and ignores non-object vars', () => {
    expect(() => testing.checkSensitiveVars({ vars: { SAFE: '1' } } as any)).not.toThrow()
    expect(() => testing.checkSensitiveVars({ vars: [] } as any)).not.toThrow()
  })

  it('doctor reports failed file checks', () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'whoami') {
        return { status: 0, stdout: 'Logged in as demo', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    const originalReadText = fs.readFileSync(path.join(process.cwd(), 'jest.worker.config.json'), 'utf8')
    const missingToml = path.join(process.cwd(), 'wrangler.toml')
    const renamedToml = path.join(process.cwd(), 'wrangler.toml.bak-test')
    fs.renameSync(missingToml, renamedToml)
    try {
      testing.doctor()
      expect(consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('检查失败: wrangler.toml')
      expect(originalReadText.length).toBeGreaterThan(0)
    } finally {
      fs.renameSync(renamedToml, missingToml)
    }
  })

  it('doctor reports unauthenticated status from wrangler output', () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'whoami') {
        return { status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    testing.doctor()
    expect(consoleLogSpy).toHaveBeenCalledWith('[WARNING]', 'Cloudflare 未登录 (执行 npx wrangler login)')
  })

  it('print-config stays non-interactive and applies forced resource overrides', async () => {
    const envPath = path.join(process.cwd(), 'tmp.print-config.toml')
    fs.writeFileSync(envPath, 'name = "override-name"\n')
    try {
      await testing.printConfig({ env: 'development', storage: 'd1', d1: 'jsonbase', confFile: envPath })
      const output = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n')
      expect(output).toContain('"name": "override-name"')
      expect(output).toContain('"database_name": "jsonbase"')
      expect(promptMock).not.toHaveBeenCalled()
    } finally {
      fs.unlinkSync(envPath)
    }
  })

  it('print-config fails for invalid forced resource/backend combination', async () => {
    await expect(testing.printConfig({ storage: 'd1', kv: 'cache' })).rejects.toThrow('process.exit:1')
  })

  it('print-config fails when conf-file is missing', async () => {
    await expect(testing.printConfig({ confFile: 'missing-config.toml' })).rejects.toThrow('process.exit:1')
  })

  it('deploy plan in non-interactive mode prints plan and uses generated config path', async () => {
    await testing.deploy({ plan: true, nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase' })
    const output = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(output).toContain('[PLAN] 部署计划')
    expect(output).toContain('.wrangler/deploy/generated/development/wrangler.jsonc')
    expect(output).toContain('命令: npx wrangler deploy --config')
  })

  it('deploy plan prints resolved resources when ensureResources is used in non-interactive mode without forced overrides', async () => {
    await testing.deploy({ plan: true, nonInteractive: true, env: 'development', storage: 'd1' })
    const output = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(output).toContain('[PLAN] 部署计划')
  })

  it('deploy fails when wrangler.toml is missing', async () => {
    const wranglerPath = path.join(process.cwd(), 'wrangler.toml')
    const backupPath = path.join(process.cwd(), 'wrangler.toml.bak-test')
    fs.renameSync(wranglerPath, backupPath)
    try {
      await expect(testing.deploy({ plan: true, nonInteractive: true })).rejects.toThrow('process.exit:1')
    } finally {
      fs.renameSync(backupPath, wranglerPath)
    }
  })

  it('ensureWranglerLogin fails when interactive login command exits non-zero', () => {
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'whoami') return { status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'login') return { status: 1, stdout: '', stderr: '' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })

    expect(() => testing.ensureWranglerLogin({})).toThrow('process.exit:1')
  })

  it('ensureWranglerLogin fails when verification after login still shows unauthenticated', () => {
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'whoami') return { status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'login') return { status: 0, stdout: '', stderr: '' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'whoami') return { status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })

    expect(() => testing.ensureWranglerLogin({})).toThrow('process.exit:1')
  })

  it('deploy fails when conf-file format is unsupported', async () => {
    const confPath = path.join(process.cwd(), 'tmp.deploy-cli.unsupported.yaml')
    fs.writeFileSync(confPath, 'name: bad')
    try {
      await expect(testing.deploy({ plan: true, nonInteractive: true, confFile: confPath, env: 'development', storage: 'd1', d1: 'jsonbase' })).rejects.toThrow('process.exit:1')
    } finally {
      fs.unlinkSync(confPath)
    }
  })

  it('deploy fails when schema file is missing', async () => {
    const schemaPath = path.join(process.cwd(), 'node_modules', 'wrangler', 'config-schema.json')
    const backupPath = path.join(process.cwd(), 'node_modules', 'wrangler', 'config-schema.json.bak-test')
    fs.renameSync(schemaPath, backupPath)
    try {
      await expect(testing.deploy({ plan: true, nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase' })).rejects.toThrow('process.exit:1')
    } finally {
      fs.renameSync(backupPath, schemaPath)
    }
  })

  it('deploy fails when generated config misses required fields after schema sanitization', async () => {
    const schema = testing.sanitizeConfigBySchema({ name: 'worker' } as any, new Set(['name', 'compatibility_date']))
    expect(() => testing.assertRequiredFields(schema)).toThrow('process.exit:1')
  })

  it('ensureDeployFiles writes generated and redirect config files', () => {
    const written = testing.ensureDeployFiles('test-env', { name: 'demo' } as any)
    expect(fs.existsSync(written.generatedPath)).toBe(true)
    expect(fs.existsSync(written.redirectPath)).toBe(true)
  })

  it('runBuild succeeds and upsertApiKeySecret succeeds with mocks', () => {
    expect(() => testing.runBuild(false)).not.toThrow()
    expect(() => testing.upsertApiKeySecret('1234567890123456', 'demo-worker', path.join(process.cwd(), 'deploy-cli.ts'))).not.toThrow()
  })

  it('list helpers return mocked cloud resources', () => {
    expect(testing.listD1Databases()).toHaveLength(2)
    expect(testing.listKVNamespaces()).toHaveLength(2)
    expect(testing.listR2Buckets()).toEqual([{ name: 'files' }])
  })

  it('select helpers handle empty lists and selected resources', async () => {
    promptMock.mockResolvedValueOnce({ databaseId: 'db-jsonbase' })
    expect(await testing.selectD1Database({ binding: 'JSONBASE_DB', database_name: 'jsonbase' }, false)).toEqual({
      type: 'd1', binding: 'JSONBASE_DB', id: 'db-jsonbase', name: 'jsonbase', status: 'existing'
    })

    promptMock.mockResolvedValueOnce({ namespaceId: 'kv-jsonbase' })
    expect(await testing.selectKVNamespace('JSONBIN', false)).toEqual({ type: 'kv', binding: 'JSONBIN', id: 'kv-jsonbase', status: 'existing' })

    promptMock.mockResolvedValueOnce({ bucketName: 'files' })
    expect(await testing.selectR2Bucket({ binding: 'FILES', bucket_name: 'files' }, false)).toEqual({ type: 'r2', binding: 'FILES', id: 'files', status: 'existing' })
  })

  it('select helpers fail in non-interactive mode when resource is missing', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'd1' && normalizedArgs[2] === 'list') return { status: 0, stdout: '[]', stderr: '' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })
    await expect(testing.selectD1Database({ binding: 'JSONBASE_DB', database_name: 'jsonbase' }, true)).resolves.toBeNull()
  })

  it('create prompt helpers handle fallback and failure branches', async () => {
    promptMock.mockResolvedValueOnce({ databaseName: 'fallback-db' })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'd1' && normalizedArgs[2] === 'create') return { status: 0, stdout: 'created without uuid', stderr: '' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'd1' && normalizedArgs[2] === 'list') return { status: 0, stdout: JSON.stringify([{ uuid: 'db-fallback', name: 'fallback-db' }]), stderr: '' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })
    expect(await testing.createD1DatabaseWithPrompt('fallback-db')).toEqual({ type: 'd1', binding: 'fallback-db', id: 'db-fallback', name: 'fallback-db', status: 'created' })

    promptMock.mockResolvedValueOnce({ namespaceTitle: 'bad-kv' })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'kv' && normalizedArgs[2] === 'namespace' && normalizedArgs[3] === 'create') return { status: 1, stdout: '', stderr: 'failed' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })
    expect(await testing.createKVNamespaceWithPrompt('bad-kv')).toBeNull()

    promptMock.mockResolvedValueOnce({ bucketName: 'bad-bucket' })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'r2' && normalizedArgs[2] === 'bucket' && normalizedArgs[3] === 'create') return { status: 1, stdout: '', stderr: 'failed' } as any
      return mockSpawn(String(_command), normalizedArgs)
    })
    expect(await testing.createR2BucketWithPrompt('bad-bucket')).toBeNull()
  })

  it('ensure resource helpers cover fail/manual/create fallback branches', async () => {
    promptMock.mockResolvedValueOnce({ action: 'fail' })
    expect(await testing.ensureD1Database({ binding: 'JSONBASE_DB', database_name: 'missing-db' }, 'ask', false, false)).toEqual({ type: 'd1', binding: 'JSONBASE_DB', id: '', status: 'pending' })

    promptMock.mockResolvedValueOnce({ action: 'manual' })
    promptMock.mockResolvedValueOnce({ namespaceId: 'kv-jsonbase' })
    expect(await testing.ensureKVNamespace({ binding: 'JSONBIN' }, 'ask', false, false)).toEqual({ type: 'kv', binding: 'JSONBIN', id: 'kv-jsonbase', status: 'existing' })

    promptMock.mockResolvedValueOnce({ action: 'manual' })
    promptMock.mockResolvedValueOnce({ bucketName: 'files' })
    expect(await testing.ensureR2Bucket({ binding: 'FILES', bucket_name: 'missing-files' }, 'ask', false, false)).toEqual({ type: 'r2', binding: 'FILES', id: 'files', status: 'existing' })
  })

  it('promptResourceBindings covers D1/KV/R2 creation and preview skip branches', async () => {
    promptMock.mockResolvedValueOnce({ databaseId: '__create_new__' })
    promptMock.mockResolvedValueOnce({ databaseName: 'created-from-prompt' })
    promptMock.mockResolvedValueOnce({ namespaceId: '__create_new__' })
    promptMock.mockResolvedValueOnce({ namespaceTitle: 'created-kv' })
    promptMock.mockResolvedValueOnce({ bucketName: '__create_new__' })
    promptMock.mockResolvedValueOnce({ bucketName: 'created-bucket' })

    const resources = await testing.promptResourceBindings({
      d1_databases: [{ binding: 'JSONBASE_DB', database_name: 'jsonbase' }],
      kv_namespaces: [{ binding: 'JSONBIN', id: 'kv-jsonbase' }],
      r2_buckets: [{ binding: 'FILES', bucket_name: 'files' }]
    } as any, 'd1', true)

    expect(resources[0].type).toBe('d1')
  })

  it('ensureResources reuses preselected resources and fills missing ones', async () => {
    const resources = await testing.ensureResources({
      d1_databases: [{ binding: 'JSONBASE_DB', database_name: 'jsonbase' }],
      r2_buckets: [{ binding: 'FILES', bucket_name: 'files' }]
    } as any, 'd1', 'auto', {}, [{ type: 'd1', binding: 'JSONBASE_DB', id: 'db-jsonbase', name: 'jsonbase', status: 'existing' }])
    expect(resources.some((resource: any) => resource.type === 'd1' && resource.id === 'db-jsonbase')).toBe(true)
  })

  it('runMigrations handles skip branches and runHealthcheck success branch', async () => {
    expect(() => testing.runMigrations({} as any, path.join(process.cwd(), 'deploy-cli.ts'))).not.toThrow()
    const originalFetch = global.fetch
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ status: 'ok' }) })) as any
    await expect(testing.runHealthcheck({ name: 'demo-worker' } as any)).resolves.toBeUndefined()
    global.fetch = originalFetch
  })

  it('deploy fails when sensitive vars include API_KEY', async () => {
    const confPath = path.join(process.cwd(), 'tmp.deploy-cli.secret.json')
    fs.writeFileSync(confPath, JSON.stringify({ vars: { API_KEY: 'bad' } }))
    try {
      await expect(testing.deploy({ plan: true, nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', confFile: confPath })).rejects.toThrow('process.exit:1')
    } finally {
      fs.unlinkSync(confPath)
    }
  })

  it('deploy fails when config validation finds missing main path', async () => {
    const confPath = path.join(process.cwd(), 'tmp.deploy-cli.invalid-main.json')
    fs.writeFileSync(confPath, JSON.stringify({ main: 'missing-entry.js' }))
    try {
      await expect(testing.deploy({ plan: true, nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', confFile: confPath })).rejects.toThrow('process.exit:1')
    } finally {
      fs.unlinkSync(confPath)
    }
  })

  it('deploy dry-run stays aligned with deploy flow without asking API key when not needed', async () => {
    await testing.deploy({ dryRun: true, nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase' })
    const output = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(output).toContain('[DRY-RUN] 配置预览')
    expect(output).toContain('"database_name": "jsonbase"')
  })

  it('deploy skips secret write when requested', async () => {
    await testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', skipSecret: true, skipBuild: true, skipHealthcheck: true, skipMigrate: true })
    const output = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(output).toContain('API_KEY Secret: 已跳过 (--skip-secret)')
    expect(spawnSyncMock.mock.calls.some((call) => String(call[1]).includes('secret'))).toBe(false)
  })

  it('deploy skips migration when backend is kv', async () => {
    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'kv', kv: 'jsonbase', skipSecret: true, skipBuild: true, skipHealthcheck: true })).resolves.toBeUndefined()
    const output = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(output).not.toContain('数据库迁移')
  })

  it('deploy logs missing API key when secret is not skipped', async () => {
    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', skipMigrate: true, skipBuild: true, skipHealthcheck: true })).resolves.toBeUndefined()
    const output = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    expect(output).toContain('API_KEY Secret: 未检测到 API_KEY，跳过写入')
  })

  it('deploy continues when healthcheck returns non-ok response', async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 })) as any

    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', skipMigrate: true, skipSecret: true, skipBuild: true })).resolves.toBeUndefined()

    global.fetch = originalFetch
  })

  it('deploy fails when migration command fails', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'd1' && normalizedArgs[2] === 'execute') {
        return { status: 1, stdout: 'migration failed', stderr: 'sql error' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', skipBuild: true, skipSecret: true })).rejects.toThrow('process.exit:1')
  })

  it('deploy fails when build step fails', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (String(_command) === 'npm' && normalizedArgs[0] === 'run' && normalizedArgs[1] === 'build') {
        return { status: 1, stdout: 'build failed', stderr: 'error' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', skipMigrate: true, skipSecret: true })).rejects.toThrow('process.exit:1')
  })

  it('deploy fails when secret write fails', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'secret' && normalizedArgs[2] === 'put') {
        return { status: 1, stdout: 'secret failed', stderr: 'error' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', apiKey: 'manual-api-key-123', skipMigrate: true, skipBuild: true })).rejects.toThrow('process.exit:1')
  })

  it('deploy fails when final wrangler deploy fails', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'deploy') {
        return { status: 1, stdout: 'deploy failed', stderr: 'error' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', skipMigrate: true, skipSecret: true, skipBuild: true, skipHealthcheck: true })).rejects.toThrow('process.exit:1')
  })

  it('deploy continues when healthcheck fails', async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn(async () => {
      throw new Error('network error')
    }) as any

    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', skipMigrate: true, skipSecret: true, skipBuild: true })).resolves.toBeUndefined()

    global.fetch = originalFetch
  })

  it('deploy prompts for login in interactive mode and verifies afterwards', async () => {
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'whoami') {
        return { status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'login') {
        return { status: 0, stdout: '', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'whoami') {
        return { status: 0, stdout: 'Logged in as demo', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    promptMock.mockResolvedValueOnce({ env: 'development' })
    promptMock.mockResolvedValueOnce({ storage: 'd1' })
    promptMock.mockResolvedValueOnce({ databaseId: 'db-jsonbase' })
    promptMock.mockResolvedValueOnce({ apiKey: 'manual-api-key-123' })

    await testing.deploy({ plan: true })
    const loginCall = spawnSyncMock.mock.calls.find((call) => (call[1] as string[])[1] === 'login')
    expect(loginCall).toBeDefined()
  })

  it('deploy fails in non-interactive mode when wrangler is unauthenticated', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = ((args as readonly string[] | undefined) || [])
      if (normalizedArgs[1] === 'whoami') {
        return { status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    await expect(testing.deploy({ plan: true, nonInteractive: true })).rejects.toThrow('process.exit:1')
  })
})

function mockSpawn(command: string, args: readonly string[]) {
  if (command === 'npm' && args[0] === 'run' && args[1] === 'build') {
    return { status: 0, stdout: 'build ok', stderr: '' } as any
  }

  if (args[0] !== 'wrangler') {
    return { status: 0, stdout: '', stderr: '' } as any
  }

  const sub = args.slice(1)
  if (sub[0] === 'whoami') {
    return { status: 0, stdout: 'Logged in as demo', stderr: '' } as any
  }
  if (sub[0] === 'login') {
    return { status: 0, stdout: '', stderr: '' } as any
  }
  if (sub[0] === 'd1' && sub[1] === 'list') {
    return {
      status: 0,
      stdout: JSON.stringify([
        { uuid: 'db-jsonbase', name: 'jsonbase' },
        { uuid: 'db-jsonbase-dev', name: 'jsonbase_dev' }
      ]),
      stderr: ''
    } as any
  }
  if (sub[0] === 'd1' && sub[1] === 'create') {
    const name = sub[2]
    return { status: 0, stdout: `Created database ${name}\n"uuid": "123e4567-e89b-12d3-a456-426614174000"`, stderr: '' } as any
  }
  if (sub[0] === 'd1' && sub[1] === 'execute') {
    return { status: 0, stdout: 'migration ok', stderr: '' } as any
  }
  if (sub[0] === 'kv' && sub[1] === 'namespace' && sub[2] === 'list') {
    return {
      status: 0,
      stdout: JSON.stringify([
        { id: 'kv-jsonbase', title: 'jsonbase' },
        { id: 'kv-cache', title: 'cache' }
      ]),
      stderr: ''
    } as any
  }
  if (sub[0] === 'kv' && sub[1] === 'namespace' && sub[2] === 'create') {
    const name = sub[3]
    return { status: 0, stdout: `Created namespace ${name}\nid = "1234567890abcdef1234567890abcdef"`, stderr: '' } as any
  }
  if (sub[0] === 'r2' && sub[1] === 'bucket' && sub[2] === 'list') {
    return { status: 0, stdout: JSON.stringify([{ name: 'files' }]), stderr: '' } as any
  }
  if (sub[0] === 'r2' && sub[1] === 'bucket' && sub[2] === 'create') {
    return { status: 0, stdout: 'bucket created', stderr: '' } as any
  }
  if (sub[0] === 'secret' && sub[1] === 'put') {
    return { status: 0, stdout: 'secret ok', stderr: '' } as any
  }
  if (sub[0] === 'deploy') {
    return { status: 0, stdout: 'deploy ok', stderr: '' } as any
  }

  return { status: 0, stdout: '', stderr: '' } as any
}
