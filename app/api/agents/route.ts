import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getAgentDaemon } from '@/server/agent-daemon'
import { ensureAgentDir } from '@/lib/agents/directory'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const workspace = await db.workspace.findFirst({
      where: { userId: session.user.id },
    })

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    const agents = await db.agent.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(agents)
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, role, model, soul_md, runtime_type, provider, provider_config } = body

  if (!name || !soul_md) {
    return NextResponse.json(
      { error: 'name and soul_md required' },
      { status: 400 }
    )
  }

  // Only allow username-style names: lowercase alphanumeric, hyphens, underscores
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
    return NextResponse.json(
      { error: 'Agent name must be username-style: lowercase letters, numbers, hyphens, underscores. Must start with a letter.' },
      { status: 400 }
    )
  }

  const runtimeType = ['claude-code', 'hermes', 'openclaw', 'generic-llm'].includes(runtime_type)
    ? runtime_type
    : 'claude-code'
  if (provider_config !== undefined && (typeof provider_config !== 'object' || provider_config === null || Array.isArray(provider_config))) {
    return NextResponse.json(
      { error: 'provider_config must be an object with optional baseUrl/apiKey/model' },
      { status: 400 }
    )
  }

  try {
    const workspace = await db.workspace.findFirst({
      where: { userId: session.user.id },
    })

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    const openclaw_id = name.toLowerCase().replace(/\s+/g, '')

    const agent = await db.agent.create({
      data: {
        workspaceId: workspace.id,
        openclawId: openclaw_id,
        name,
        role: role || null,
        model: model || 'anthropic/claude-sonnet-4-5',
        runtimeType,
        provider: provider || null,
        providerConfig: provider_config ?? null,
        soulMd: soul_md,
        isAdmin: false,
        status: 'online',
      },
    })

    // Create agent directory and write CLAUDE.md
    const dirPath = ensureAgentDir(agent.id, soul_md)

    // Start the agent's process via its runtime
    const daemon = getAgentDaemon()
    daemon.startAgent({
      id: agent.id,
      openclawId: openclaw_id,
      name,
      model: agent.model,
      runtimeType: runtimeType as 'claude-code',
      provider: provider || undefined,
      providerConfig: provider_config ?? undefined,
      soulMd: soul_md,
      isAdmin: false,
      dirPath,
    })

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Error creating agent:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
