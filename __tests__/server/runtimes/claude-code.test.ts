import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import os from 'os'
import path from 'path'
import fs from 'fs'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-runtimes-'))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── resolveModel (pure) ──────────────────────────────────────────────

describe('resolveModel', () => {
  it('maps known Anthropic models to CLI aliases', async () => {
    const { resolveModel } = await import('@/server/runtimes/claude-code')
    expect(resolveModel('anthropic/claude-sonnet-4-5')).toBe('sonnet')
    expect(resolveModel('anthropic/claude-opus-4')).toBe('opus')
    expect(resolveModel('anthropic/claude-haiku-3-5')).toBe('haiku')
  })

  it('passes through provider-prefixed models for proxy setups', async () => {
    const { resolveModel } = await import('@/server/runtimes/claude-code')
    expect(resolveModel('openrouter/anthropic/claude-sonnet-4')).toBe('openrouter/anthropic/claude-sonnet-4')
    expect(resolveModel('deepseek/deepseek-chat')).toBe('deepseek/deepseek-chat')
    expect(resolveModel('mistral/mistral-large')).toBe('mistral/mistral-large')
    expect(resolveModel('x-ai/grok-4')).toBe('x-ai/grok-4')
    expect(resolveModel('ollama/llama3.1')).toBe('ollama/llama3.1')
  })

  it('falls back to sonnet for unknown models', async () => {
    const { resolveModel } = await import('@/server/runtimes/claude-code')
    expect(resolveModel('unknown/model')).toBe('sonnet')
  })

  it('lets an explicit providerConfig.model override win', async () => {
    const { resolveModel } = await import('@/server/runtimes/claude-code')
    expect(resolveModel('anthropic/claude-opus-4', { model: 'deepseek-reasoner' })).toBe('deepseek-reasoner')
  })
})

// ── buildSpawnEnv (pure) ─────────────────────────────────────────────

describe('buildSpawnEnv', () => {
  it('inherits process.env and adds nothing without providerConfig', async () => {
    const { buildSpawnEnv } = await import('@/server/runtimes/claude-code')
    const env = buildSpawnEnv({ id: 'a1', openclawId: 'oc', name: 'x', model: 'm', soulMd: null, isAdmin: false, dirPath: tmpDir })
    expect(env).toEqual(expect.objectContaining(process.env))
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined()
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
  })

  it('maps providerConfig.baseUrl/apiKey to ANTHROPIC_* vars', async () => {
    const { buildSpawnEnv } = await import('@/server/runtimes/claude-code')
    const env = buildSpawnEnv({
      id: 'a1', openclawId: 'oc', name: 'x', model: 'deepseek/deepseek-chat',
      providerConfig: { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test' },
      soulMd: null, isAdmin: false, dirPath: tmpDir,
    })
    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com')
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test')
  })
})

// ── Registry dispatch + spawn env through the daemon ────────────────

function createMockChild() {
  const child: any = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.kill = vi.fn()
  child.exitCode = null
  return child
}

describe('AgentDaemon runtime dispatch', () => {
  it('routes agents with provider-prefixed models + providerConfig to the claude-code runtime with proxy env', async () => {
    const mockSpawn = vi.fn()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    const mockChild = createMockChild()
    vi.spyOn(mockChild.stdin, 'write')
    mockSpawn.mockReturnValue(mockChild)

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent({
      id: 'a1',
      openclawId: 'oc-1',
      name: 'DeepSeek Agent',
      model: 'deepseek/deepseek-chat',
      runtimeType: 'claude-code',
      provider: 'deepseek',
      providerConfig: { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test' },
      soulMd: null,
      isAdmin: false,
      dirPath: tmpDir,
    })

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const args = mockSpawn.mock.calls[0][1]
    const modelIdx = args.indexOf('--model')
    expect(args[modelIdx + 1]).toBe('deepseek/deepseek-chat')
    const opts = mockSpawn.mock.calls[0][2]
    expect(opts.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com')
    expect(opts.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test')
    // warmup sent
    expect(mockChild.stdin.write).toHaveBeenCalled()
  })

  it('normalizes unknown runtimeType values to claude-code', async () => {
    const mockSpawn = vi.fn()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    vi.doMock('@/lib/agents/directory', () => ({ listAgentSkills: () => [] }))
    const g = globalThis as any
    delete g.__agentDaemon

    mockSpawn.mockReturnValue(createMockChild())

    const { getAgentDaemon } = await import('@/server/agent-daemon')
    const daemon = getAgentDaemon()
    daemon.startAgent({
      id: 'a2', openclawId: 'oc-2', name: 'Future Runtime', model: 'anthropic/claude-sonnet-4-5',
      runtimeType: 'hermes' as any, // not implemented yet — must fall back to claude-code
      soulMd: null, isAdmin: false, dirPath: tmpDir,
    })

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const args = mockSpawn.mock.calls[0][1]
    expect(args[0]).toBe('-p')
  })
})
