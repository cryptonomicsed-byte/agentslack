/**
 * Shared ReAct turn loop for turn-based runtimes (GenericLLM, OpenClaw).
 * The model iterates: tool calls -> execute via the internal API -> feed
 * results back — until it produces a final text answer, which the runtime
 * posts to the channel (unless the model already used send_message itself).
 */
import type { AgentConfig, IncomingMessage, ActivityCallback } from './types'
import type { ChatClient, ChatMessage, ChatTool } from './openai-client'
import { executeTool } from './tool-executor'

export interface TurnMessage {
  agent: AgentConfig
  message: IncomingMessage
  client: ChatClient
  tools: ChatTool[]
  systemPrompt: string
  formatUserMessage: (agent: AgentConfig, msg: IncomingMessage) => string
  postReply: (content: string) => Promise<void>
  maxTurns?: number
  onActivity?: ActivityCallback
}

export async function runChatTurnWithMessage(opts: TurnMessage): Promise<void> {
  const maxTurns = opts.maxTurns ?? 8
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.formatUserMessage(opts.agent, opts.message) },
  ]

  let usedSendMessage = false
  let finalText: string | null = null

  for (let i = 0; i < maxTurns; i++) {
    const res = await opts.client.chat(messages, opts.tools)
    opts.onActivity?.(opts.agent.id, {
      type: 'result',
      subtype: 'turn',
      durationMs: 0,
      totalCostUsd: null,
      timestamp: Date.now(),
    })

    if (res.toolCalls && res.toolCalls.length > 0) {
      messages.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls })
      for (const tc of res.toolCalls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          args = {}
        }
        if (tc.function.name === 'send_message') usedSendMessage = true
        opts.onActivity?.(opts.agent.id, {
          type: 'tool_use',
          toolName: tc.function.name,
          input: JSON.stringify(args).slice(0, 200),
          timestamp: Date.now(),
        })
        const result = await executeTool(opts.agent.id, tc.function.name, args)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 8000),
        })
      }
      continue
    }

    finalText = res.content
    break
  }

  if (finalText && finalText.trim() && !usedSendMessage) {
    await opts.postReply(finalText.trim())
  }
}
