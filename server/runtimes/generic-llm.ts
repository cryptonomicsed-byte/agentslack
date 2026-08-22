/**
 * GenericLLMRuntime — in-process ReAct loop against any OpenAI-compatible
 * endpoint (DeepSeek, Mistral, Groq, xAI, OpenRouter, Ollama /v1, ...).
 * No external CLI harness required. Tools are AgentSlack's internal API.
 */
import type { AgentRuntime } from './interface'
import type {
  AgentConfig,
  AgentRuntimeType,
  IncomingMessage,
  ActivityCallback,
  SessionStatusCallback,
  StatusCallback,
} from './types'
import { OpenAICompatibleClient, type ChatClient } from './openai-client'
import { AGENT_TOOLS, executeTool, internalBaseUrl } from './tool-executor'
import { runChatTurnWithMessage } from './turn-runner'

const MAX_TURNS = 8

function buildSystemPrompt(agent: AgentConfig): string {
  return `You are ${agent.name}, an agent inside AgentSlack, a Slack-like workspace for AI agents.
${agent.soulMd ? `## Identity\n${agent.soulMd}` : ''}
## Rules
- You reply with plain text. Your final reply is automatically delivered to the channel/thread by the runtime.
- You have tools to read channel history, manage tasks, list agents/channels/projects. Use them when useful.
- Never fabricate tool results; if a tool errors, say so.
- Keep replies concise and useful.`
}

function formatUserMessage(agent: AgentConfig, msg: IncomingMessage): string {
  const parts = [
    `[Channel: ${msg.channelId}]`,
    msg.threadId ? `[Thread: ${msg.threadId}]` : null,
    `${msg.senderName}: ${msg.content}`,
  ]
  return parts.filter(Boolean).join(' ')
}

export class GenericLLMRuntime implements AgentRuntime {
  readonly type: AgentRuntimeType = 'generic-llm'

  private configs = new Map<string, AgentConfig>()
  private stopped = new Set<string>()
  private onStatusChange: StatusCallback | null = null
  private onSessionStatusChange: SessionStatusCallback | null = null
  private onActivity: ActivityCallback | null = null

  constructor(private clientFactory?: (agent: AgentConfig) => ChatClient) {}

  setStatusCallback(cb: StatusCallback) { this.onStatusChange = cb }
  setSessionStatusCallback(cb: SessionStatusCallback) { this.onSessionStatusChange = cb }
  setActivityCallback(cb: ActivityCallback) { this.onActivity = cb }

  startAgent(agent: AgentConfig) {
    this.configs.set(agent.id, agent)
    this.stopped.delete(agent.id)
    this.onStatusChange?.(agent.id, 'online')
  }

  private clientFor(agent: AgentConfig): ChatClient {
    if (this.clientFactory) return this.clientFactory(agent)
    const baseUrl = agent.providerConfig?.baseUrl || process.env.LLM_BASE_URL || ''
    if (!baseUrl) throw new Error(`generic-llm agent ${agent.name} has no baseUrl (set provider config)`)
    const apiKey = agent.providerConfig?.apiKey || process.env.LLM_API_KEY || ''
    const model = agent.providerConfig?.model || agent.model
    return new OpenAICompatibleClient(baseUrl, apiKey, model)
  }

  async postReply(agentId: string, content: string, msg: IncomingMessage) {
    await executeTool(agentId, 'send_message', {
      channelId: msg.channelId,
      threadId: msg.threadId ?? undefined,
      content,
    })
  }

  deliverMessage(agentId: string, message: IncomingMessage): boolean {
    const agent = this.configs.get(agentId)
    if (!agent || this.stopped.has(agentId)) return false
    const client = this.clientFor(agent)
    runChatTurnWithMessage({
      agent,
      message,
      client,
      tools: AGENT_TOOLS,
      maxTurns: MAX_TURNS,
      systemPrompt: buildSystemPrompt(agent),
      formatUserMessage,
      postReply: (content) => this.postReply(agentId, content, message),
      onActivity: this.onActivity ?? undefined,
    }).catch((err) => {
      console.error(`[GenericLLMRuntime] ${agent.name} turn failed:`, err)
      this.onActivity?.(agentId, {
        type: 'system',
        subtype: 'error',
        timestamp: Date.now(),
      })
    })
    return true
  }

  isReady(agentId: string): boolean { return this.configs.has(agentId) }
  isRunning(agentId: string): boolean { return this.configs.has(agentId) && !this.stopped.has(agentId) }
  getRunningCount(): number { return this.configs.size }
  getStatuses() {
    return [...this.configs.entries()].map(([agentId, config]) => ({
      agentId,
      name: config.name,
      ready: true,
      running: this.isRunning(agentId),
    }))
  }
  stopAgent(agentId: string) { this.configs.delete(agentId) }
  stopAgentManual(agentId: string) {
    this.stopped.add(agentId)
    this.configs.delete(agentId)
    this.onStatusChange?.(agentId, 'offline')
  }
  startAgentManual(agentId: string) {
    this.stopped.delete(agentId)
    const agent = this.configs.get(agentId)
    if (agent) this.startAgent(agent)
  }
  restartAgent(agentId: string) {
    this.stopped.delete(agentId)
    this.onStatusChange?.(agentId, 'online')
  }
  updateConfig(agentId: string, updates: Partial<AgentConfig>) {
    const config = this.configs.get(agentId)
    if (config) this.configs.set(agentId, { ...config, ...updates })
  }
  stopAll() {
    this.configs.clear()
    this.stopped.clear()
  }
}

export { internalBaseUrl }
