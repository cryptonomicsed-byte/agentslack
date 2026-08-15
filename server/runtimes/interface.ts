import type {
  AgentConfig,
  AgentRuntimeType,
  IncomingMessage,
  SessionConfig,
  SessionStatusCallback,
  StatusCallback,
  ActivityCallback,
} from './types'

/**
 * A pluggable agent runtime. The daemon is a registry of runtimes; each
 * runtime owns its processes, sessions, restart policy and provider wiring.
 *
 * Implementations:
 *  - ClaudeCodeRuntime: spawns the `claude` CLI (stream-json) — existing behavior.
 *  - HermesRuntime:     spawns/manages Hermes Agent processes (planned).
 *  - OpenClawRuntime:   talks to the OpenClaw Gateway (planned).
 *  - GenericLLMRuntime: in-process ReAct loop over the MCP bridge (planned).
 */
export interface AgentRuntime {
  readonly type: AgentRuntimeType

  /** Start (or re-start) the process for a single agent. */
  startAgent(agent: AgentConfig): void
  /** Stop an agent's process (auto-restart still applies unless manual). */
  stopAgent(agentId: string): void
  /** Manually stop — prevents auto-restart. */
  stopAgentManual(agentId: string): void
  /** Clear the manual-stop flag and start. */
  startAgentManual(agentId: string): void
  /** Restart (stop then start) an agent. */
  restartAgent(agentId: string): void
  /** Update the cached config (e.g. after a model change). */
  updateConfig(agentId: string, updates: Partial<AgentConfig>): void
  /** Deliver a workspace message to the agent. Returns false if undeliverable. */
  deliverMessage(agentId: string, message: IncomingMessage): boolean
  isReady(agentId: string): boolean
  isRunning(agentId: string): boolean
  getRunningCount(): number
  getStatuses(): Array<{ agentId: string; name: string; ready: boolean; running: boolean }>

  // ── Task worktree sessions (optional per runtime) ─────────────────
  startSession?(agent: AgentConfig, session: SessionConfig): void
  stopSession?(agentId: string, taskId: string): void
  deliverSessionMessage?(agentId: string, taskId: string, message: IncomingMessage): boolean
  /** Whether a session currently exists for the agent/task (ready or not). */
  hasSession?(agentId: string, taskId: string): boolean
  isSessionReady?(agentId: string, taskId: string): boolean
  getActiveSessionCount?(agentId: string): number

  // ── Lifecycle & callbacks ─────────────────────────────────────────
  setStatusCallback(cb: StatusCallback): void
  setSessionStatusCallback(cb: SessionStatusCallback): void
  setActivityCallback(cb: ActivityCallback): void
  stopAll(): void
}
