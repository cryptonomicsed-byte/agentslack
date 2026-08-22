'use client'

import { useState } from 'react'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PROVIDERS, modelsForProvider } from '@/lib/agents/model-catalog'

export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [runtime, setRuntime] = useState('claude-code')
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('anthropic/claude-sonnet-4-5')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [soulMd, setSoulMd] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const isValidName = /^[a-z][a-z0-9_-]*$/.test(name)
  const currentProvider = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0]
  const modelOptions = modelsForProvider(provider)
  const needsEndpoint = runtime !== 'claude-code' || provider !== 'anthropic'

  const RUNTIME_OPTIONS = [
    { value: 'claude-code', label: 'Claude Code CLI', hint: 'Native Anthropic models or a proxy via base URL' },
    { value: 'hermes', label: 'Hermes Agent', hint: 'Hermes CLI with isolated memory/skills (needs hermes on host)' },
    { value: 'openclaw', label: 'OpenClaw Gateway', hint: 'Routes to an OpenClaw agent via its gateway URL' },
    { value: 'generic-llm', label: 'Generic LLM', hint: 'In-process ReAct loop — any OpenAI-compatible endpoint' },
  ]

  const handleProviderChange = (next: string) => {
    setProvider(next)
    const first = modelsForProvider(next)[0]
    if (first) setModel(first.value)
  }

  const handleCreate = async () => {
    if (!name.trim() || !soulMd.trim()) return
    if (!isValidName) return

    setIsCreating(true)
    try {
      const providerConfig =
        apiBaseUrl.trim() || apiKey.trim()
          ? { baseUrl: apiBaseUrl.trim() || undefined, apiKey: apiKey.trim() || undefined }
          : undefined

      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          role,
          model,
          soul_md: soulMd,
          runtime_type: runtime,
          provider,
          provider_config: providerConfig,
        }),
      })

      if (response.ok) {
        onClose()
        window.location.reload()
      } else {
        const error = await response.json()
        alert(`Failed to create agent: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to create agent:', error)
      alert('Failed to create agent')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-muted-foreground" />
            <DialogTitle>Create Agent</DialogTitle>
          </div>
          <DialogDescription>
            Create a new AI agent. Non-Anthropic models require a proxy base URL (e.g. a
            claude-code-router or OpenAI-compatible endpoint).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">@</span>
              <Input
                placeholder="techhy, code-bot, researcher"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              />
            </div>
            {name && !isValidName && (
              <p className="text-xs text-destructive">
                Lowercase letters, numbers, hyphens, underscores only. Must start with a letter.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Role</label>
            <Input
              placeholder="Tech Research Specialist"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Runtime</label>
            <select
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {RUNTIME_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {RUNTIME_OPTIONS.find((r) => r.value === runtime)?.hint}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Provider</label>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {modelOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {needsEndpoint && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Provider endpoint (optional — required for non-Anthropic models)
              </p>
              <div className="grid grid-cols-1 gap-2">
                <Input
                  placeholder="Base URL (e.g. https://api.deepseek.com)"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="API key (optional)"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Current provider: {currentProvider.label}. For Ollama use e.g.{' '}
                http://host:11434/v1 with an ollama model id.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Personality & Instructions</label>
            <textarea
              placeholder="You are a helpful coding assistant specializing in..."
              value={soulMd}
              onChange={(e) => setSoulMd(e.target.value)}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !name.trim() || !soulMd.trim() || !isValidName}
          >
            {isCreating ? 'Creating...' : 'Create Agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
