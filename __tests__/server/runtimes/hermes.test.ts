import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-hermes-'))

const mockExecFile = vi.fn()

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.doMock('child_process', () => ({ execFile: mockExecFile }))
})

afterEach(() => {
  mockExecFile.mockReset()
  vi.unstubAllGlobals()
})

const AGENT = {
  id: 'a1',
  openclawId: 'oc-1',
  name: 'Hermy',
  model: 'deepseek/deepseek-chat',
  runtimeType: 'hermes' as const,
  providerConfig: { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', model: 'deepseek-chat' },
  soulMd: 'You are a Hermes agent.',
  isAdmin: false,
  dirPath: tmpDir,
}

describe('HermesRuntime', () => {
  it('writes an isolated HERMES_HOME config and posts the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '{"ok":true}' })
    vi.stubGlobal('fetch', fetchMock)

    mockExecFile.mockImplementation((bin: string, args: string[], opts: any, cb: any) => {
      cb(null, 'Hello from Hermes!\n', '')
    })

    const { HermesRuntime } = await import('@/server/runtimes/hermes')
    const rt = new HermesRuntime()
    const statuses: string[] = []
    rt.setStatusCallback((_id, s) => statuses.push(s))
    rt.startAgent(AGENT)
    expect(statuses).toContain('online')

    // config written
    const configPath = path.join(tmpDir, '.hermes-home', 'config.yaml')
    expect(fs.existsSync(configPath)).toBe(true)
    const cfg = fs.readFileSync(configPath, 'utf8')
    expect(cfg).toContain('custom_providers')
    expect(cfg).toContain('https://api.deepseek.com')
    expect(cfg).toContain('mcp_servers')
    expect(cfg).toContain('AGENT_ID: a1')

    rt.deliverMessage('a1', { channelId: 'c1', senderName: 'user', content: 'hello' })
    await new Promise((r) => setTimeout(r, 100))

    // hermes spawned with chat -p and isolated home
    expect(mockExecFile).toHaveBeenCalledTimes(1)
    const [bin, args, opts] = mockExecFile.mock.calls[0]
    expect(bin).toBe('hermes')
    expect(args[0]).toBe('chat')
    expect(args[1]).toBe('-p')
    expect(String(args[2])).toContain('[Channel: c1]')
    expect(args[3]).toBe('-Q')
    expect((opts.env as any).HERMES_HOME).toBe(path.join(tmpDir, '.hermes-home'))

    // reply posted via internal send-message
    const sendCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes('send-message'))
    expect(sendCalls.length).toBe(1)
    expect(JSON.parse(sendCalls[0][1].body).content).toBe('Hello from Hermes!')
  })

  it('degrades to offline when the hermes binary is missing', async () => {
    vi.stubGlobal('fetch', vi.fn())
    mockExecFile.mockImplementation((bin: string, args: string[], opts: any, cb: any) => {
      const err: NodeJS.ErrnoException = new Error('spawn hermes ENOENT')
      err.code = 'ENOENT'
      cb(err, '', '')
    })

    const { HermesRuntime } = await import('@/server/runtimes/hermes')
    const rt = new HermesRuntime()
    const statuses: string[] = []
    const activities: unknown[] = []
    rt.setStatusCallback((_id, s) => statuses.push(s))
    rt.setActivityCallback((_id, ev) => activities.push(ev))
    rt.startAgent(AGENT)
    rt.deliverMessage('a1', { channelId: 'c1', senderName: 'user', content: 'hi' })
    await new Promise((r) => setTimeout(r, 100))

    expect(statuses).toContain('offline')
    expect(activities.some((a: any) => a.type === 'system' && a.subtype === 'error')).toBe(true)
  })
})

// keep vitest happy about unused imports in some environments
export {}
