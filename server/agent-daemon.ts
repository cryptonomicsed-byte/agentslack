/**
 * AgentDaemon — registry of pluggable agent runtimes.
 *
 * The daemon resolves each agent to a runtime by its `runtimeType` and
 * forwards every call. All existing callers (server.ts, API routes) keep
 * using this module's public API; the process mechanics live in
 * `server/runtimes/*`.
 */
import type { AgentRuntime } from './runtimes/interface'
import { ClaudeCodeRuntime } from './runtimes/claude-code'
import { HermesRuntime } from './runtimes/hermes'
import { OpenClawRuntime } from './runtimes/openclaw'
import { GenericLLMRuntime } from './runtimes/generic-llm'
import type {
  AgentConfig,
  AgentRuntimeType,
  IncomingMessage,
  SessionConfig,
  StatusCallback,
  SessionStatusCallback,
  ActivityCallback,
} from './runtimes/types'
import { normalizeRuntimeType } from './runtimes/types'

export type { AgentConfig, SessionConfig } from './runtimes/types'

class AgentDaemon {
  private runtimes = new Map<AgentRuntimeType, AgentRuntime>()
  private byAgent = new Map<string, AgentRuntime>()
  private configs = new Map<string, AgentConfig>()
  private onStatusChange: StatusCallback | null = null
  private onSessionStatusChange: SessionStatusCallback | null = null
  private onActivity: ActivityCallback | null = null

  // ── Runtime registry ───────────────────────────────────────────────

  private createRuntime(type: AgentRuntimeType): AgentRuntime {
    let runtime: AgentRuntime
    switch (type) {
      case 'hermes':
        runtime = new HermesRuntime()
        break
      case 'openclaw':
        runtime = new OpenClawRuntime()
        break
      case 'generic-llm':
        runtime = new GenericLLMRuntime()
        break
      default:
        runtime = new ClaudeCodeRuntime()
    }
    if (this.onStatusChange) runtime.setStatusCallback(this.onStatusChange)
    if (this.onSessionStatusChange) runtime.setSessionStatusCallback(this.onSessionStatusChange)
    if (this.onActivity) runtime.setActivityCallback(this.onActivity)
    this.runtimes.set(type, runtime)
    return runtime
  }

  private runtimeFor(agent: AgentConfig): AgentRuntime {
    const type = normalizeRuntimeType(agent.runtimeType)
    const existing = this.byAgent.get(agent.id)
    if (existing) {
      if (existing.type === type) return existing
      // Runtime type changed — stop the old binding and rebind.
      existing.stopAgentManual(agent.id)
      this.byAgent.delete(agent.id)
    }
    let runtime = this.runtimes.get(type)
    if (!runtime) runtime = this.createRuntime(type)
    this.byAgent.set(agent.id, runtime)
    this.configs.set(agent.id, agent)
    return runtime
  }

  private runtimeForAgentId(agentId: string): AgentRuntime | undefined {
    return this.byAgent.get(agentId)
  }

  // ── Callbacks (stored + propagated to every runtime) ───────────────

  setStatusCallback(cb: StatusCallback) {
    this.onStatusChange = cb
    for (const runtime of this.runtimes.values()) runtime.setStatusCallback(cb)
  }

  setSessionStatusCallback(cb: SessionStatusCallback) {
    this.onSessionStatusChange = cb
    for (const runtime of this.runtimes.values()) runtime.setSessionStatusCallback(cb)
  }

  setActivityCallback(cb: ActivityCallback) {
    this.onActivity = cb
    for (const runtime of this.runtimes.values()) runtime.setActivityCallback(cb)
  }

  // ── Agent lifecycle ────────────────────────────────────────────────

  startAll(agents: AgentConfig[]) {
    console.log(`[AgentDaemon] Starting ${agents.length} agent(s)...`)

    // Stop any agents not in the new config (cleanup stale processes from HMR)
    const newIds = new Set(agents.map((a) => a.id))
    for (const [id, runtime] of this.byAgent) {
      if (!newIds.has(id)) {
        console.log(`[AgentDaemon] Stopping stale agent ${id}`)
        runtime.stopAgentManual(id)
        this.byAgent.delete(id)
        this.configs.delete(id)
      }
    }

    for (const agent of agents) {
      const runtime = this.runtimeFor(agent)
      runtime.startAgent(agent)
    }

    process.on('SIGTERM', () => this.stopAll())
    process.on('SIGINT', () => this.stopAll())
  }

  startAgent(agent: AgentConfig) {
    const runtime = this.runtimeFor(agent)
    runtime.startAgent(agent)
  }

  stopAgent(agentId: string) {
    this.runtimeForAgentId(agentId)?.stopAgent(agentId)
  }

  stopAgentManual(agentId: string) {
    const runtime = this.runtimeForAgentId(agentId)
    if (runtime) {
      runtime.stopAgentManual(agentId)
    } else {
      // Preserve legacy behavior: unknown agents still report offline.
      this.onStatusChange?.(agentId, 'offline')
    }
  }

  startAgentManual(agentId: string) {
    this.runtimeForAgentId(agentId)?.startAgentManual(agentId)
  }

  restartAgent(agentId: string) {
    this.runtimeForAgentId(agentId)?.restartAgent(agentId)
  }

  updateConfig(agentId: string, updates: Partial<AgentConfig>) {
    const config = this.configs.get(agentId)
    if (config) this.configs.set(agentId, { ...config, ...updates })
    this.runtimeForAgentId(agentId)?.updateConfig(agentId, updates)
  }

  deliverMessage(agentId: string, message: IncomingMessage): boolean {
    return this.runtimeForAgentId(agentId)?.deliverMessage(agentId, message) ?? false
  }

  isReady(agentId: string): boolean {
    return this.runtimeForAgentId(agentId)?.isReady(agentId) ?? false
  }

  isRunning(agentId: string): boolean {
    return this.runtimeForAgentId(agentId)?.isRunning(agentId) ?? false
  }

  getRunningCount(): number {
    let count = 0
    for (const runtime of this.runtimes.values()) count += runtime.getRunningCount()
    return count
  }

  getAgentStatuses(): Array<{ agentId: string; name: string; ready: boolean; running: boolean }> {
    const statuses: Array<{ agentId: string; name: string; ready: boolean; running: boolean }> = []
    for (const runtime of this.runtimes.values()) statuses.push(...runtime.getStatuses())
    return statuses
  }

  // ── Task worktree sessions ─────────────────────────────────────────

  startSession(agentConfig: AgentConfig, sessionConfig: SessionConfig) {
    const runtime = this.runtimeFor(agentConfig)
    runtime.startSession?.(agentConfig, sessionConfig)
  }

  stopSession(agentId: string, taskId: string) {
    this.runtimeForAgentId(agentId)?.stopSession?.(agentId, taskId)
  }

  deliverSessionMessage(agentId: string, taskId: string, message: IncomingMessage): boolean {
    return this.runtimeForAgentId(agentId)?.deliverSessionMessage?.(agentId, taskId, message) ?? false
  }

  /**
   * Whether a task session currently exists for the agent/task.
   * (Callers only truthiness-check this — see app/api/messages/route.ts.)
   */
  getSession(agentId: string, taskId: string): boolean {
    return this.runtimeForAgentId(agentId)?.hasSession?.(agentId, taskId) ?? false
  }

  getActiveSessionCount(agentId: string): number {
    let count = 0
    for (const runtime of this.runtimes.values()) {
      if (runtime.getActiveSessionCount) count += runtime.getActiveSessionCount(agentId)
    }
    return count
  }

  isSessionReady(agentId: string, taskId: string): boolean {
    return this.runtimeForAgentId(agentId)?.isSessionReady?.(agentId, taskId) ?? false
  }

  // ── Shutdown ───────────────────────────────────────────────────────

  stopAll() {
    for (const runtime of this.runtimes.values()) runtime.stopAll()
    this.byAgent.clear()
    this.configs.clear()
  }
}

const globalForDaemon = globalThis as unknown as { __agentDaemon?: AgentDaemon }

export function createAgentDaemon(): AgentDaemon {
  if (globalForDaemon.__agentDaemon) {
    globalForDaemon.__agentDaemon.stopAll()
  }
  globalForDaemon.__agentDaemon = new AgentDaemon()
  return globalForDaemon.__agentDaemon
}

export function getAgentDaemon(): AgentDaemon {
  if (!globalForDaemon.__agentDaemon) {
    globalForDaemon.__agentDaemon = new AgentDaemon()
  }
  return globalForDaemon.__agentDaemon
}
