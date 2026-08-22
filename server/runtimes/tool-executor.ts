/**
 * Tool executor for turn-based runtimes (GenericLLM / OpenClaw).
 *
 * Exposes AgentSlack's internal agent API as OpenAI-style tools and executes
 * them over HTTP. The internal routes are the same ones the MCP bridge uses
 * (no auth — they are only reachable inside the deployment).
 */
import type { ChatTool } from './openai-client'

export function internalBaseUrl(): string {
  return (
    process.env.AGENTSLACK_INTERNAL_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  )
}

const str = (description: string, required = true): Record<string, unknown> => ({
  type: 'string',
  description,
  ...(required ? {} : {}),
})

export const AGENT_TOOLS: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Send a message to a channel or thread. Use this for all replies.',
      parameters: {
        type: 'object',
        properties: {
          channelId: str('The channel ID to send to'),
          content: str('The message content'),
          threadId: { type: 'string', description: 'Optional thread ID to reply in' },
        },
        required: ['channelId', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_history',
      description: 'Read recent messages from a channel or thread.',
      parameters: {
        type: 'object',
        properties: {
          channelId: str('The channel ID'),
          threadId: { type: 'string', description: 'Optional thread ID' },
          limit: { type: 'number', description: 'Max messages (default 20)' },
        },
        required: ['channelId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_messages',
      description: 'Check for new unread messages in your channels.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_channels',
      description: 'List channels you belong to.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_agents',
      description: 'List other agents in the workspace.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'List projects (repos) in the workspace.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'View the task board for a channel.',
      parameters: {
        type: 'object',
        properties: {
          channelId: str('The channel ID'),
          status: { type: 'string', description: 'todo | in_progress | in_review | done | all' },
        },
        required: ['channelId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_tasks',
      description: 'Create subtasks to decompose work. projectId is required (use list_projects).',
      parameters: {
        type: 'object',
        properties: {
          channelId: str('The channel ID'),
          projectId: str('The project ID from list_projects'),
          tasks: {
            type: 'array',
            items: { type: 'object', properties: { title: str('Task title') }, required: ['title'] },
            description: 'Task definitions',
          },
          summary: { type: 'string', description: 'Optional summary' },
        },
        required: ['channelId', 'projectId', 'tasks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'claim_tasks',
      description: 'Claim tasks before starting work.',
      parameters: {
        type: 'object',
        properties: {
          channelId: str('The channel ID'),
          task_numbers: { type: 'array', items: { type: 'number' }, description: 'Task numbers to claim' },
          message_ids: { type: 'array', items: { type: 'string' }, description: 'Task message IDs' },
        },
        required: ['channelId', 'task_numbers'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'unclaim_task',
      description: 'Release a task you can no longer work on.',
      parameters: {
        type: 'object',
        properties: {
          channelId: str('The channel ID'),
          task_number: { type: 'number', description: 'Task number' },
          taskId: { type: 'string', description: 'Optional task ID' },
        },
        required: ['channelId', 'task_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task_status',
      description: 'Update task progress (todo, in_progress, in_review, done).',
      parameters: {
        type: 'object',
        properties: {
          channelId: str('The channel ID'),
          task_number: { type: 'number', description: 'Task number' },
          taskId: { type: 'string', description: 'Optional task ID' },
          status: str('New status: todo | in_progress | in_review | done'),
        },
        required: ['channelId', 'task_number', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_context',
      description: 'Get details about a task (project, branch, worktree).',
      parameters: {
        type: 'object',
        properties: { task_id: str('The task ID') },
        required: ['task_id'],
      },
    },
  },
]

type HttpMethods = 'GET' | 'POST'

interface RouteSpec {
  method: HttpMethods
  path: string
  query?: (args: Record<string, unknown>) => string
  body?: (args: Record<string, unknown>) => Record<string, unknown>
}

const ROUTES: Record<string, RouteSpec> = {
  send_message: {
    method: 'POST',
    path: 'send-message',
    body: (a) => ({
      channelId: a.channelId,
      content: a.content,
      threadId: a.threadId ?? undefined,
    }),
  },
  read_history: {
    method: 'GET',
    path: 'read-history',
    query: (a) => `channelId=${encodeURIComponent(String(a.channelId))}${a.threadId ? `&threadId=${encodeURIComponent(String(a.threadId))}` : ''}${a.limit ? `&limit=${a.limit}` : ''}`,
  },
  check_messages: { method: 'GET', path: 'check-messages' },
  list_channels: { method: 'GET', path: 'list-channels' },
  list_agents: { method: 'GET', path: 'list-agents' },
  list_projects: { method: 'GET', path: 'list-projects' },
  list_tasks: {
    method: 'GET',
    path: 'tasks',
    query: (a) => `channelId=${encodeURIComponent(String(a.channelId))}${a.status && a.status !== 'all' ? `&status=${encodeURIComponent(String(a.status))}` : ''}`,
  },
  create_tasks: {
    method: 'POST',
    path: 'tasks',
    body: (a) => ({
      channelId: a.channelId,
      projectId: a.projectId,
      tasks: a.tasks,
      summary: a.summary ?? undefined,
    }),
  },
  claim_tasks: {
    method: 'POST',
    path: 'tasks/claim',
    body: (a) => ({
      channelId: a.channelId,
      task_numbers: a.task_numbers,
      message_ids: a.message_ids ?? undefined,
    }),
  },
  unclaim_task: {
    method: 'POST',
    path: 'tasks/unclaim',
    body: (a) => ({
      channelId: a.channelId,
      task_number: a.task_number,
      taskId: a.taskId ?? undefined,
    }),
  },
  update_task_status: {
    method: 'POST',
    path: 'tasks/update-status',
    body: (a) => ({
      channelId: a.channelId,
      task_number: a.task_number,
      taskId: a.taskId ?? undefined,
      status: a.status,
    }),
  },
  get_task_context: {
    method: 'GET',
    path: 'session-context',
    query: (a) => `task_id=${encodeURIComponent(String(a.task_id))}`,
  },
}

/**
 * Execute one agent tool call against the internal API.
 * Returns a JSON-serializable result (or { error } on failure).
 */
export async function executeTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
  baseUrl: string = internalBaseUrl(),
): Promise<unknown> {
  const spec = ROUTES[toolName]
  if (!spec) return { error: `unknown tool: ${toolName}` }

  const path = `/api/internal/agent/${agentId}/${spec.path}`
  const url = spec.method === 'GET'
    ? `${baseUrl}${path}${spec.query ? `?${spec.query(args)}` : ''}`
    : `${baseUrl}${path}`

  const init: RequestInit = { method: spec.method, headers: { 'Content-Type': 'application/json' } }
  if (spec.method === 'POST') init.body = JSON.stringify(spec.body ? spec.body(args) : args)

  try {
    const res = await fetch(url, init)
    const text = await res.text()
    if (!res.ok) return { error: `${res.status}: ${text.slice(0, 300)}` }
    try {
      return text ? JSON.parse(text) : { ok: true }
    } catch {
      return { ok: true, raw: text.slice(0, 2000) }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
