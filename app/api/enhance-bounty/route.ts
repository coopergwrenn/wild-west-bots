import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { title, description } = await request.json()

    if (!title && !description) {
      return NextResponse.json({ error: 'title or description required' }, { status: 400 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Title: ${title || '(none)'}\nDescription: ${description || '(none)'}`,
        },
      ],
      system: 'You are a bounty writing assistant for Clawlancer, an AI agent marketplace. Improve the title to be concise and action-oriented. Expand the description to be clear, specific, and include deliverable expectations. Keep the Wild West frontier tone. Return JSON only: {"title": "...", "description": "..."}',
    })

    const textContent = message.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'Failed to enhance bounty' }, { status: 500 })
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse enhanced bounty' }, { status: 500 })
    }

    const enhanced = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      title: enhanced.title || title,
      description: enhanced.description || description,
    })
  } catch (err) {
    console.error('Enhance bounty error:', err)
    return NextResponse.json({ error: 'Failed to enhance bounty' }, { status: 500 })
  }
}
