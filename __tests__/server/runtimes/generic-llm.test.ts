import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-llm-'))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const AGENT = {
  id: 'a1',
  openclawId: 'oc-1',
  name: 'Deep Agent',
  model: 'deepseek/deepseek-chat',
  runtimeType: 'generic-llm' as const,
  providerConfig: { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', model: 'deepseek-chat' },
  soulMd: 'You are a researcher.',
  isAdmin: false,
  dirPath: tmpDir,
}

function okFetch() {
  return vi.fn().mockResolvedValue({ ok: true, text: async () => '{"ok":true}' })
}

describe('GenericLLMRuntime', () => {
  it('runs a tool-call turn and posts the final reply via send_message', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)

    const { GenericLLMRuntime } = await import('@/server/runtimes/generic-llm')
    const chat = vi.fn()
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [{ id: 't1', type: 'function', function: { name: 'list_channels', arguments: '{}' } }],
      })
      .mockResolvedValueOnce({ content: 'All clear.', toolCalls: [] })

    const rt = new GenericLLMRuntime(() => ({ chat }) as any)
    const activities: unknown[] = []
    rt.setActivityCallback((_id, ev) => activities.push(ev))
    rt.startAgent(AGENT)

    const delivered = rt.deliverMessage('a1', { channelId: 'c1', senderName: 'user', content: 'check channels' })
    expect(delivered).toBe(true)
    await new Promise((r) => setTimeout(r, 100))

    expect(chat).toHaveBeenCalledTimes(2)
    // tool executed against the internal API
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/internal/agent/a1/list-channels'),
      expect.objectContaining({ method: 'GET' }),
    )
    // final reply posted via send-message
    const sendCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes('send-message'))
    expect(sendCalls.length).toBe(1)
    expect(JSON.parse(sendCalls[0][1].body)).toEqual({ channelId: 'c1', content: 'All clear.', threadId: undefined })
    expect(activities.some((a: any) => a.type === 'tool_use' && a.toolName === 'list_channels')).toBe(true)
  })

  it('does not double-post when the model already used send_message', async () => {
    const fetchMock = okFetch()
    vi.stubGlobal('fetch', fetchMock)

    const { GenericLLMRuntime } = await import('@/server/runtimes/generic-llm')
    const chat = vi.fn().mockResolvedValueOnce({
      content: null,
      toolCalls: [{
        id: 't1',
        type: 'function',
        function: { name: 'send_message', arguments: '{"channelId":"c1","content":"direct reply"}' },
      }],
    })

    const rt = new GenericLLMRuntime(() => ({ chat }) as any)
    rt.startAgent(AGENT)
    rt.deliverMessage('a1', { channelId: 'c1', senderName: 'user', content: 'hi' })
    await new Promise((r) => setTimeout(r, 100))

    const sendCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes('send-message'))
    expect(sendCalls.length).toBe(1) // exactly the tool call, no auto-post
  })

  it('returns false for unknown/stopped agents', async () => {
    const { GenericLLMRuntime } = await import('@/server/runtimes/generic-llm')
    const rt = new GenericLLMRuntime()
    expect(rt.deliverMessage('nope', { channelId: 'c1', senderName: 'x', content: 'hi' })).toBe(false)
    rt.startAgent(AGENT)
    rt.stopAgentManual('a1')
    expect(rt.deliverMessage('a1', { channelId: 'c1', senderName: 'x', content: 'hi' })).toBe(false)
  })
})
