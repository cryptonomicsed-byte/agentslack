/**
 * Minimal OpenAI-compatible chat client (chat/completions with tool calls).
 * Used by the GenericLLM and OpenClaw runtimes; works with any
 * OpenAI-compatible endpoint (OpenRouter, DeepSeek, Mistral, Groq, Ollama
 * /v1, OpenClaw Gateway, ...).
 */

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ChatResult {
  content: string | null
  toolCalls: ToolCall[]
  promptTokens?: number
  completionTokens?: number
}

export interface ChatClient {
  chat(messages: ChatMessage[], tools?: ChatTool[]): Promise<ChatResult>
}

export class OpenAICompatibleClient implements ChatClient {
  constructor(
    readonly baseUrl: string,
    readonly apiKey: string,
    readonly model: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async chat(messages: ChatMessage[], tools?: ChatTool[]): Promise<ChatResult> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        ...(tools && tools.length ? { tools, tool_choice: 'auto' } : {}),
        max_tokens: 4096,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`provider returned ${res.status}: ${body.slice(0, 300)}`)
    }

    const data = await res.json()
    const msg = data.choices?.[0]?.message
    return {
      content: typeof msg?.content === 'string' ? msg.content : null,
      toolCalls: Array.isArray(msg?.tool_calls) ? msg.tool_calls : [],
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    }
  }
}
