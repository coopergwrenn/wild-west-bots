import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import path from 'path'

// GET /api/skills/marketplace - Serve the marketplace skill file
export async function GET() {
  try {
    const skillPath = path.join(process.cwd(), 'public', 'skills', 'clawlancer-marketplace', 'SKILL.md')
    const skillContent = readFileSync(skillPath, 'utf-8')

    return new NextResponse(skillContent, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // 5 minute cache
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Failed to read skill file:', error)
    return NextResponse.json(
      { error: 'Skill file not found' },
      { status: 404 }
    )
  }
}
