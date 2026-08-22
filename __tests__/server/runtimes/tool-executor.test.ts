import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })
}

describe('executeTool', () => {
  it('builds GET URLs with query params', async () => {
    const fetchMock = mockFetchOk({ messages: [] })
    vi.stubGlobal('fetch', fetchMock)
    const { executeTool } = await import('@/server/runtimes/tool-executor')
    await executeTool('a1', 'read_history', { channelId: 'c1', threadId: 't1', limit: 5 }, 'http://base')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://base/api/internal/agent/a1/read-history?channelId=c1&threadId=t1&limit=5',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('posts send_message with the right body', async () => {
    const fetchMock = mockFetchOk({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const { executeTool } = await import('@/server/runtimes/tool-executor')
    await executeTool('a1', 'send_message', { channelId: 'c1', content: 'hi', threadId: 't9' }, 'http://base')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://base/api/internal/agent/a1/send-message')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ channelId: 'c1', content: 'hi', threadId: 't9' })
  })

  it('returns an error object for unknown tools', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { executeTool } = await import('@/server/runtimes/tool-executor')
    const res = await executeTool('a1', 'nope', {}, 'http://base')
    expect(res).toEqual({ error: 'unknown tool: nope' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces non-ok responses as error objects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    vi.stubGlobal('fetch', fetchMock)
    const { executeTool } = await import('@/server/runtimes/tool-executor')
    const res = await executeTool('a1', 'list_channels', {}, 'http://base')
    expect(res).toEqual({ error: '500: boom' })
  })
})
