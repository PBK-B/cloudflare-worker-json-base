import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as path from 'path'

const promptMock = jest.fn<any>()
const spawnSyncMock = jest.fn<any>()
const chalkProxy = new Proxy({}, { get: () => (value: string) => value })

jest.mock('chalk', () => ({ __esModule: true, default: chalkProxy }))
jest.mock('inquirer', () => ({ __esModule: true, default: { prompt: promptMock } }))
jest.mock('child_process', () => ({ __esModule: true, spawnSync: (...args: unknown[]) => spawnSyncMock(...args) }))

describe('deploy-cli wrangler integration helpers', () => {
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

  it('parses wrangler list outputs via helper wrappers', () => {
    expect(testing.listD1Databases()).toEqual([
      { uuid: 'db-jsonbase', name: 'jsonbase' },
      { uuid: 'db-fallback', name: 'fallback-db' },
    ])
    expect(testing.listKVNamespaces()).toEqual([
      { id: 'kv-jsonbase', title: 'jsonbase' },
      { id: 'kv-fallback', title: 'fallback-kv' },
    ])
    expect(testing.listR2Buckets()).toEqual([{ name: 'files' }, { name: 'archive' }])
  })

  it('creates D1 resource from wrangler create output', async () => {
    const resource = await testing.createD1DatabaseByName('new-db', 'JSONBASE_DB')
    expect(resource).toEqual({
      type: 'd1',
      binding: 'JSONBASE_DB',
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'new-db',
      status: 'created',
    })
  })

  it('creates KV resource from wrangler create output', async () => {
    const resource = await testing.createKVNamespaceByName('new-kv', 'JSONBIN')
    expect(resource).toEqual({
      type: 'kv',
      binding: 'JSONBIN',
      id: '1234567890abcdef1234567890abcdef',
      status: 'created',
    })
  })

  it('identifies unauthenticated whoami output and authenticated output', () => {
    expect(testing.isWranglerAuthenticated({ ok: true, status: 0, stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' })).toBe(false)
    expect(testing.isWranglerAuthenticated({ ok: true, status: 0, stdout: 'Logged in as demo', stderr: '' })).toBe(true)
  })

  it('uses local wrangler binary formatting when available', () => {
    const command = testing.formatWranglerCommand(['deploy', '--config', 'demo.jsonc'])
    expect(command).toContain(path.join('node_modules', 'wrangler', 'bin', 'wrangler.js'))
    expect(command).toContain('deploy --config demo.jsonc')
  })

  it('builds cmd wrapper for npm/npx on windows', () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      expect(testing.buildSpawnCommand('npx.cmd', ['wrangler', 'whoami'])).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npx.cmd wrangler whoami'],
      })
      expect(testing.buildSpawnCommand('npm', ['run', 'build'])).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm run build'],
      })
    } finally {
      if (descriptor) {
        Object.defineProperty(process, 'platform', descriptor)
      }
    }
  })

  it('fails getCommandOutput when wrangler command fails', () => {
    spawnSyncMock.mockImplementationOnce(() => ({ status: 1, stdout: '', stderr: 'boom' }))
    expect(() => testing.getCommandOutput(['kv', 'namespace', 'list'])).toThrow('boom')
  })
})

function mockSpawn(command: string, args: readonly string[]) {
  const commandLine = [command, ...args].join(' ')
  if (!commandLine.includes('wrangler')) {
    return { status: 0, stdout: '', stderr: '' } as any
  }

  if (commandLine.includes('d1 list')) {
    return {
      status: 0,
      stdout: JSON.stringify([
        { uuid: 'db-jsonbase', name: 'jsonbase' },
        { uuid: 'db-fallback', name: 'fallback-db' },
      ]),
      stderr: '',
    } as any
  }

  if (commandLine.includes('kv namespace list')) {
    return {
      status: 0,
      stdout: JSON.stringify([
        { id: 'kv-jsonbase', title: 'jsonbase' },
        { id: 'kv-fallback', title: 'fallback-kv' },
      ]),
      stderr: '',
    } as any
  }

  if (commandLine.includes('r2 bucket list')) {
    return {
      status: 0,
      stdout: JSON.stringify([{ name: 'files' }, { name: 'archive' }]),
      stderr: '',
    } as any
  }

  if (commandLine.includes('d1 create')) {
    return {
      status: 0,
      stdout: 'Created database\n"uuid": "123e4567-e89b-12d3-a456-426614174000"',
      stderr: '',
    } as any
  }

  if (commandLine.includes('kv namespace create')) {
    return {
      status: 0,
      stdout: 'Created namespace\nid = "1234567890abcdef1234567890abcdef"',
      stderr: '',
    } as any
  }

  if (commandLine.includes('whoami')) {
    return { status: 0, stdout: 'Logged in as demo', stderr: '' } as any
  }

  return { status: 0, stdout: '', stderr: '' } as any
}
