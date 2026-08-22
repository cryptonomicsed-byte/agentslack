import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenAICompatibleClient', () => {
  it('posts chat/completions with bearer auth and parses a plain reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      text: async () => '',
    })
    const { OpenAICompatibleClient } = await import('@/server/runtimes/openai-client')
    const client = new OpenAICompatibleClient('https://api.deepseek.com/', 'sk-1', 'deepseek-chat', fetchMock as any)

    const res = await client.chat([{ role: 'user', content: 'hi' }])

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-1' }),
      }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.model).toBe('deepseek-chat')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(res.content).toBe('hello')
    expect(res.promptTokens).toBe(10)
  })

  it('parses tool_calls from the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'list_channels', arguments: '{}' } }],
          },
        }],
      }),
      text: async () => '',
    })
    const { OpenAICompatibleClient } = await import('@/server/runtimes/openai-client')
    const client = new OpenAICompatibleClient('https://x', 'k', 'm', fetchMock as any)

    const res = await client.chat([{ role: 'user', content: 'go' }], [{ type: 'function', function: { name: 'list_channels', description: '', parameters: {} } }])
    expect(res.toolCalls).toHaveLength(1)
    expect(res.toolCalls[0].function.name).toBe('list_channels')
  })

  it('throws on non-ok responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' })
    const { OpenAICompatibleClient } = await import('@/server/runtimes/openai-client')
    const client = new OpenAICompatibleClient('https://x', 'k', 'm', fetchMock as any)
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/429/)
  })
})
