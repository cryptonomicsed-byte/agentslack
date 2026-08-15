/**
 * Static model catalog for the agent UI.
 *
 * Model values use `<provider>/<model>` form; the claude-code runtime passes
 * through non-Anthropic values (see server/runtimes/claude-code.ts
 * `resolveModel`) — pair those with a proxy via providerConfig.baseUrl.
 * Roadmap: replace with a live OpenRouter catalog fetch later.
 */

export interface ModelOption {
  value: string
  label: string
}

export interface ProviderDef {
  id: string
  label: string
  models: ModelOption[]
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (native)',
    models: [
      { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { value: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'anthropic/claude-opus-4', label: 'Claude Opus 4' },
      { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { value: 'anthropic/claude-haiku-3-5', label: 'Claude Haiku 3.5' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (proxy)',
    models: [
      { value: 'openrouter/anthropic/claude-sonnet-4', label: 'Claude Sonnet 4 (via OpenRouter)' },
      { value: 'openrouter/anthropic/claude-opus-4', label: 'Claude Opus 4 (via OpenRouter)' },
      { value: 'openrouter/deepseek/deepseek-chat', label: 'DeepSeek Chat (via OpenRouter)' },
      { value: 'openrouter/deepseek/deepseek-reasoner', label: 'DeepSeek Reasoner (via OpenRouter)' },
      { value: 'openrouter/mistral/mistral-large', label: 'Mistral Large (via OpenRouter)' },
      { value: 'openrouter/openai/gpt-5', label: 'GPT-5 (via OpenRouter)' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek (direct)',
    models: [
      { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
      { value: 'deepseek/deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral (direct)',
    models: [
      { value: 'mistral/mistral-large-latest', label: 'Mistral Large' },
      { value: 'mistral/mistral-medium', label: 'Mistral Medium' },
    ],
  },
  {
    id: 'x-ai',
    label: 'xAI (Grok)',
    models: [
      { value: 'x-ai/grok-4', label: 'Grok 4' },
      { value: 'x-ai/grok-4-fast', label: 'Grok 4 Fast' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    models: [
      { value: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { value: 'groq/deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B' },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    models: [
      { value: 'ollama/llama3.1', label: 'Llama 3.1' },
      { value: 'ollama/qwen2.5-coder', label: 'Qwen 2.5 Coder' },
    ],
  },
]

export const MODEL_OPTIONS: ModelOption[] = PROVIDERS.flatMap((p) => p.models)

/** The provider id for a model value (falls back to 'anthropic'). */
export function providerForModel(model: string): string {
  const prefix = model.split('/')[0]
  return PROVIDERS.some((p) => p.id === prefix) ? prefix : 'anthropic'
}

export function modelsForProvider(providerId: string): ModelOption[] {
  return PROVIDERS.find((p) => p.id === providerId)?.models ?? PROVIDERS[0].models
}
