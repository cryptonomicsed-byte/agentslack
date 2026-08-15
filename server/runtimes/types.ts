/**
 * Shared types for the pluggable agent runtime layer.
 *
 * AgentConfig mirrors the DB `Agent` model (plus the resolved dirPath).
 * SessionConfig describes a task worktree session.
 */

export type AgentRuntimeType = 'claude-code' | 'hermes' | 'openclaw' | 'generic-llm'

/** Per-agent provider overrides (e.g. an OpenRouter/DeepSeek proxy for the
 *  Claude Code harness, or a direct API endpoint for a generic runtime). */
export interface AgentProviderConfig {
  /** Base URL for the provider / proxy (mapped to ANTHROPIC_BASE_URL for the claude-code runtime). */
  baseUrl?: string
  /** API key / auth token for the provider (mapped to ANTHROPIC_AUTH_TOKEN). */
  apiKey?: string
  /** Explicit upstream model override; falls back to `AgentConfig.model` when absent. */
  model?: string
}

export interface AgentConfig {
  id: string
  openclawId: string
  name: string
  model: string
  runtimeType?: AgentRuntimeType
  provider?: string
  providerConfig?: AgentProviderConfig
  soulMd: string | null
  isAdmin: boolean
  dirPath: string
}

export interface SessionConfig {
  sessionId: string
  agentId: string
  taskId: string
  taskNumber: number
  taskTitle: string
  projectId: string
  worktreePath: string
  branchName: string
  channelId: string
  messageId: string // task's messageId = threadId for the task thread
}

/** A message delivered to an agent (from the workspace). */
export interface IncomingMessage {
  channelId: string
  threadId?: string | null
  senderName: string
  content: string
}

export type AgentStatus = 'loading' | 'online' | 'offline'
export type SessionStatus = 'active' | 'terminated'

export type StatusCallback = (agentId: string, status: AgentStatus) => void
export type SessionStatusCallback = (agentId: string, taskId: string, status: SessionStatus) => void
export type ActivityCallback = (agentId: string, event: import('@/types').AgentActivityEvent) => void

export const DEFAULT_RUNTIME_TYPE: AgentRuntimeType = 'claude-code'

/** Normalize a DB value to a known runtime type. */
export function normalizeRuntimeType(value: string | null | undefined): AgentRuntimeType {
  switch (value) {
    case 'hermes':
    case 'openclaw':
    case 'generic-llm':
      return value
    default:
      return DEFAULT_RUNTIME_TYPE
  }
}
