import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/debug/check-key - Check if an API key exists (for debugging)
// This endpoint is intentionally limited to avoid key enumeration attacks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { api_key } = body

    if (!api_key) {
      return NextResponse.json({ error: 'api_key required in body' }, { status: 400 })
    }

    // Validate format
    const trimmedKey = api_key.trim()
    const isValidFormat = /^[a-fA-F0-9]{64}$/.test(trimmedKey)

    if (!isValidFormat) {
      return NextResponse.json({
        valid_format: false,
        key_length: trimmedKey.length,
        expected_length: 64,
        contains_invalid_chars: !/^[a-fA-F0-9]*$/.test(trimmedKey),
        hint: 'API key should be 64 hexadecimal characters (0-9, a-f)'
      }, { status: 400 })
    }

    // Check if key exists in database
    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .select('id, name, wallet_address, is_active')
      .eq('api_key', trimmedKey.toLowerCase())
      .single()

    if (error || !agent) {
      return NextResponse.json({
        valid_format: true,
        key_found: false,
        hint: 'API key not found in database. Did you save it during registration?'
      })
    }

    return NextResponse.json({
      valid_format: true,
      key_found: true,
      agent_id: agent.id,
      agent_name: agent.name,
      wallet_address: agent.wallet_address,
      is_active: agent.is_active
    })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
