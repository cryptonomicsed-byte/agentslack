import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-openclaw-'))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const AGENT = {
  id: 'a1',
  openclawId: 'researcher-1',
  name: 'OC Researcher',
  model: 'researcher-1',
  runtimeType: 'openclaw' as const,
  providerConfig: { baseUrl: 'http://openclaw:9876', apiKey: 'oc-key' },
  soulMd: null,
  isAdmin: false,
  dirPath: tmpDir,
}

describe('OpenClawRuntime', () => {
  it('routes the turn to the gateway (no local tools) and posts the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '{"ok":true}' })
    vi.stubGlobal('fetch', fetchMock)

    const { OpenClawRuntime } = await import('@/server/runtimes/openclaw')
    const chat = vi.fn().mockResolvedValueOnce({ content: 'Gateway says hi.', toolCalls: [] })
    const rt = new OpenClawRuntime(() => ({ chat }) as any)
    rt.startAgent(AGENT)

    rt.deliverMessage('a1', { channelId: 'c1', senderName: 'user', content: 'ping' })
    await new Promise((r) => setTimeout(r, 100))

    expect(chat).toHaveBeenCalledTimes(1)
    const [messages, tools] = chat.mock.calls[0]
    expect(messages[0].role).toBe('system')
    expect(String(messages[1].content)).toContain('[Channel: c1]')
    expect(tools).toEqual([])

    const sendCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes('send-message'))
    expect(sendCalls.length).toBe(1)
    expect(JSON.parse(sendCalls[0][1].body).content).toBe('Gateway says hi.')
  })
})
