import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/admin/revenue - Get platform revenue stats
export async function GET(request: NextRequest) {
  // Simple admin check via query param (in production, use proper admin auth)
  const { searchParams } = new URL(request.url)
  const adminKey = searchParams.get('key')

  if (adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all platform fees
    const { data: fees, error } = await supabaseAdmin
      .from('platform_fees')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch fees:', error)
      return NextResponse.json({ error: 'Failed to fetch revenue' }, { status: 500 })
    }

    // Calculate totals by type
    const totals: Record<string, bigint> = {}
    let grandTotal = BigInt(0)

    for (const fee of (fees || [])) {
      const amount = BigInt(fee.amount_wei || '0')
      const type = fee.fee_type as string
      totals[type] = (totals[type] || BigInt(0)) + amount
      grandTotal += amount
    }

    // Format for response
    const totalsByType: Record<string, string> = {}
    for (const [type, amount] of Object.entries(totals)) {
      totalsByType[type] = (Number(amount) / 1e6).toFixed(2)
    }

    return NextResponse.json({
      total_revenue_usdc: (Number(grandTotal) / 1e6).toFixed(2),
      total_revenue_wei: grandTotal.toString(),
      totals_by_type: totalsByType,
      fee_count: fees?.length || 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent_fees: (fees || []).slice(0, 20).map((f: any) => ({
        id: f.id,
        fee_type: f.fee_type,
        amount_usdc: (parseFloat(f.amount_wei) / 1e6).toFixed(4),
        description: f.description,
        created_at: f.created_at,
      })),
    })
  } catch (error) {
    console.error('Revenue error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
