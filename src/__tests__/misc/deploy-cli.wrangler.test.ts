import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'

const promptMock = jest.fn<any>()
const spawnSyncMock = jest.fn<any>()
const chalkProxy = new Proxy({}, { get: () => (value: string) => value })

jest.mock('chalk', () => ({ __esModule: true, default: chalkProxy }))
jest.mock('inquirer', () => ({ __esModule: true, default: { prompt: promptMock } }))
jest.mock('child_process', () => ({ __esModule: true, spawnSync: (...args: unknown[]) => spawnSyncMock(...args) }))

describe('deploy-cli external tool outputs', () => {
  const originalEnv = process.env
  let testing: typeof import('../../../deploy-cli').__testing
  let processExitSpy: ReturnType<typeof jest.spyOn>

  beforeEach(async () => {
    jest.resetModules()
    process.env = { ...originalEnv }
    promptMock.mockReset()
    spawnSyncMock.mockReset()
    spawnSyncMock.mockImplementation((command: unknown, args?: unknown) => mockSpawn(String(command), (args as readonly string[] | undefined) || []))

    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`)
    }) as never)

    testing = (await import('../../../deploy-cli')).__testing
  })

  afterEach(() => {
    process.env = originalEnv
    processExitSpy.mockRestore()
    jest.restoreAllMocks()
  })

  it('returns stdout from successful wrangler commands', () => {
    expect(testing.getCommandOutput(['kv', 'namespace', 'list'])).toContain('jsonbase')
  })

  it('throws command output on wrangler command failure', () => {
    spawnSyncMock.mockImplementationOnce((_command: unknown, _args?: unknown) => ({ status: 1, stdout: '', stderr: 'boom' }))
    expect(() => testing.getCommandOutput(['kv', 'namespace', 'list'])).toThrow('boom')
  })

  it('parses D1 list JSON output', () => {
    expect(testing.listD1Databases()).toEqual([
      { uuid: 'db-jsonbase', name: 'jsonbase' },
      { uuid: 'db-fallback', name: 'fallback-db' }
    ])
  })

  it('parses KV namespace list output without --json flag', () => {
    expect(testing.listKVNamespaces()).toEqual([
      { id: 'kv-jsonbase', title: 'jsonbase' },
      { id: 'kv-fallback', title: 'fallback-kv' }
    ])
  })

  it('parses R2 bucket list output without --json flag', () => {
    expect(testing.listR2Buckets()).toEqual([{ name: 'files' }, { name: 'archive' }])
  })

  it('parses D1 create output containing UUID directly', async () => {
    const resource = await testing.createD1DatabaseByName('new-db', 'JSONBASE_DB')
    expect(resource).toEqual({ type: 'd1', binding: 'JSONBASE_DB', id: '123e4567-e89b-12d3-a456-426614174000', name: 'new-db', status: 'created' })
  })

  it('falls back to D1 list when create output has no UUID', async () => {
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = (args as readonly string[] | undefined) || []
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'd1' && normalizedArgs[2] === 'create') {
        return { status: 0, stdout: 'created', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    const resource = await testing.createD1DatabaseByName('fallback-db', 'JSONBASE_DB')
    expect(resource).toEqual({ type: 'd1', binding: 'JSONBASE_DB', id: 'db-fallback', name: 'fallback-db', status: 'created' })
  })

  it('fails D1 create when neither output nor follow-up list yields an id', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = (args as readonly string[] | undefined) || []
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'd1' && normalizedArgs[2] === 'create') {
        return { status: 0, stdout: 'created', stderr: '' } as any
      }
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'd1' && normalizedArgs[2] === 'list') {
        return { status: 0, stdout: JSON.stringify([]), stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    await expect(testing.createD1DatabaseByName('missing-db', 'JSONBASE_DB')).rejects.toThrow('process.exit:1')
  })

  it('parses KV create output containing id line', async () => {
    const resource = await testing.createKVNamespaceByName('new-kv', 'JSONBIN')
    expect(resource).toEqual({ type: 'kv', binding: 'JSONBIN', id: '1234567890abcdef1234567890abcdef', status: 'created' })
  })

  it('falls back to KV list when create output has no id', async () => {
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = (args as readonly string[] | undefined) || []
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'kv' && normalizedArgs[2] === 'namespace' && normalizedArgs[3] === 'create') {
        return { status: 0, stdout: 'created', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    const resource = await testing.createKVNamespaceByName('fallback-kv', 'JSONBIN')
    expect(resource).toEqual({ type: 'kv', binding: 'JSONBIN', id: 'kv-fallback', status: 'created' })
  })

  it('fails KV create when neither output nor follow-up list yields an id', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = (args as readonly string[] | undefined) || []
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'kv' && normalizedArgs[2] === 'namespace' && normalizedArgs[3] === 'create') {
        return { status: 0, stdout: 'created', stderr: '' } as any
      }
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'kv' && normalizedArgs[2] === 'namespace' && normalizedArgs[3] === 'list') {
        return { status: 0, stdout: JSON.stringify([]), stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    await expect(testing.createKVNamespaceByName('missing-kv', 'JSONBIN')).rejects.toThrow('process.exit:1')
  })

  it('treats wrangler whoami text output as unauthenticated even with status 0', () => {
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = (args as readonly string[] | undefined) || []
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'whoami') {
        return { status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    expect(() => testing.ensureWranglerLogin({ nonInteractive: true })).toThrow('process.exit:1')
  })

  it('accepts logged-in wrangler whoami output', () => {
    expect(() => testing.ensureWranglerLogin({ nonInteractive: true })).not.toThrow()
  })

  it('builds cmd.exe wrapper for npm/npx on Windows', () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      expect(testing.quoteWindowsArg('path with spaces')).toBe('"path with spaces"')
      expect(testing.buildSpawnCommand('npx.cmd', ['wrangler', 'whoami'])).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npx.cmd wrangler whoami']
      })
      expect(testing.buildSpawnCommand('npm', ['run', 'build'])).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run build']
      })
    } finally {
      if (descriptor) {
        Object.defineProperty(process, 'platform', descriptor)
      }
    }
  })

  it('keeps direct spawn for non-windows commands', () => {
    expect(testing.buildSpawnCommand('node', ['script.js'])).toEqual({ command: 'node', args: ['script.js'] })
  })

  it('runs wrangler whoami through cmd.exe wrapper on Windows', () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      testing.ensureWranglerLogin({ nonInteractive: true })
      expect(spawnSyncMock).toHaveBeenCalledWith(
        'cmd.exe',
        ['/d', '/s', '/c', 'npx.cmd wrangler whoami'],
        expect.objectContaining({ cwd: process.cwd() })
      )
    } finally {
      if (descriptor) {
        Object.defineProperty(process, 'platform', descriptor)
      }
    }
  })

  it('fails secret put when wrangler returns an error output', () => {
    spawnSyncMock.mockImplementationOnce((_command: unknown, args?: unknown) => {
      const normalizedArgs = (args as readonly string[] | undefined) || []
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'secret' && normalizedArgs[2] === 'put') {
        return { status: 1, stdout: 'secret stdout', stderr: 'secret stderr' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    expect(() => testing.upsertApiKeySecret('1234567890123456', 'demo-worker', '/tmp/config.json')).toThrow('process.exit:1')
  })

  it('surfaces deploy stderr when wrangler deploy fails', async () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = (args as readonly string[] | undefined) || []
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'deploy') {
        return { status: 1, stdout: 'deploy stdout', stderr: 'deploy stderr' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    await expect(testing.deploy({ nonInteractive: true, env: 'development', storage: 'd1', d1: 'jsonbase', skipMigrate: true, skipSecret: true, skipBuild: true, skipHealthcheck: true })).rejects.toThrow('process.exit:1')
  })

  it('surfaces d1 execute stderr when migration fails', () => {
    spawnSyncMock.mockImplementation((_command: unknown, args?: unknown) => {
      const normalizedArgs = (args as readonly string[] | undefined) || []
      if (normalizedArgs[0] === 'wrangler' && normalizedArgs[1] === 'd1' && normalizedArgs[2] === 'execute') {
        return { status: 1, stdout: 'migration stdout', stderr: 'migration stderr' } as any
      }
      return mockSpawn(String(_command), normalizedArgs)
    })

    expect(() => testing.runMigrations({ d1_databases: [{ binding: 'JSONBASE_DB', database_name: 'jsonbase' }] } as any, '/tmp/generated.jsonc')).toThrow('process.exit:1')
  })

  it('package scripts keep deploy commands Windows-safe enough for npm/npx usage', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts.deploy).toContain('node .deploy-temp/deploy-cli.js deploy')
    expect(pkg.scripts['deploy:doctor']).toContain('node .deploy-temp/deploy-cli.js doctor')
    expect(pkg.scripts['deploy:print']).toContain('node .deploy-temp/deploy-cli.js print-config')
    expect(pkg.scripts['d1:reset']).toContain('&& npm run d1:migrate')
  })
})

function mockSpawn(command: string, args: readonly string[]) {
  if (args[0] !== 'wrangler') {
    return { status: 0, stdout: '', stderr: '' } as any
  }

  const sub = args.slice(1)
  if (sub[0] === 'whoami') {
    return { status: 0, stdout: 'Logged in as demo', stderr: '' } as any
  }
  if (sub[0] === 'd1' && sub[1] === 'list') {
    return {
      status: 0,
      stdout: JSON.stringify([
        { uuid: 'db-jsonbase', name: 'jsonbase' },
        { uuid: 'db-fallback', name: 'fallback-db' }
      ]),
      stderr: ''
    } as any
  }
  if (sub[0] === 'd1' && sub[1] === 'create') {
    return { status: 0, stdout: 'Created database\n"uuid": "123e4567-e89b-12d3-a456-426614174000"', stderr: '' } as any
  }
  if (sub[0] === 'kv' && sub[1] === 'namespace' && sub[2] === 'list') {
    return {
      status: 0,
      stdout: JSON.stringify([
        { id: 'kv-jsonbase', title: 'jsonbase' },
        { id: 'kv-fallback', title: 'fallback-kv' }
      ]),
      stderr: ''
    } as any
  }
  if (sub[0] === 'kv' && sub[1] === 'namespace' && sub[2] === 'create') {
    return { status: 0, stdout: 'Created namespace\nid = "1234567890abcdef1234567890abcdef"', stderr: '' } as any
  }
  if (sub[0] === 'r2' && sub[1] === 'bucket' && sub[2] === 'list') {
    return { status: 0, stdout: JSON.stringify([{ name: 'files' }, { name: 'archive' }]), stderr: '' } as any
  }
  if (sub[0] === 'secret' && sub[1] === 'put') {
    return { status: 0, stdout: 'secret ok', stderr: '' } as any
  }
  if (sub[0] === 'd1' && sub[1] === 'execute') {
    return { status: 0, stdout: 'execute ok', stderr: '' } as any
  }
  if (sub[0] === 'deploy') {
    return { status: 0, stdout: 'deploy ok', stderr: '' } as any
  }

  return { status: 0, stdout: '', stderr: '' } as any
}
