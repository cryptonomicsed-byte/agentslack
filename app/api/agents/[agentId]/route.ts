import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import { db } from '@/lib/db'
import { getAgentDaemon } from '@/server/agent-daemon'

// PUT /api/agents/[agentId] — Update agent fields
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { agentId } = await params
  const body = await req.json()

  const workspace = await db.workspace.findFirst({
    where: { userId: session.user.id },
  })
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId: workspace.id },
  })
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (body.model) data.model = body.model
  if (body.runtime_type !== undefined) {
    if (!['claude-code', 'hermes', 'openclaw', 'generic-llm'].includes(body.runtime_type)) {
      return NextResponse.json({ error: 'Invalid runtime_type' }, { status: 400 })
    }
    data.runtimeType = body.runtime_type
  }
  if (body.provider !== undefined) data.provider = body.provider
  if (body.provider_config !== undefined) {
    if (typeof body.provider_config !== 'object' || body.provider_config === null || Array.isArray(body.provider_config)) {
      return NextResponse.json({ error: 'provider_config must be an object' }, { status: 400 })
    }
    data.providerConfig = body.provider_config
  }

  const updated = await db.agent.update({
    where: { id: agentId },
    data,
  })

  // Refresh the daemon's cached config so the next (re)start uses the new values.
  if (body.model || body.provider_config !== undefined || body.runtime_type !== undefined) {
    const daemon = getAgentDaemon()
    daemon.updateConfig(agentId, {
      model: updated.model,
      runtimeType: (updated.runtimeType as 'claude-code') || undefined,
      provider: updated.provider || undefined,
      providerConfig: (updated.providerConfig as Record<string, unknown>) || undefined,
    })
  }

  return NextResponse.json(updated)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { agentId } = await params

  try {
    const workspace = await db.workspace.findFirst({
      where: { userId: session.user.id },
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const agent = await db.agent.findFirst({
      where: { id: agentId, workspaceId: workspace.id },
      include: {
        channelAgents: {
          include: {
            channel: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Get process info from daemon
    const daemon = getAgentDaemon()
    const isRunning = daemon.isRunning(agentId)
    const isReady = daemon.isReady(agentId)

    return NextResponse.json({
      ...agent,
      process: {
        running: isRunning,
        ready: isReady,
      },
    })
  } catch (error) {
    console.error('Error fetching agent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
