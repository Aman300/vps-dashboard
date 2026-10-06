import { NextResponse } from 'next/server';
import { getSystemMetrics } from '@/lib/system';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const metrics = await getSystemMetrics();
    return NextResponse.json({ success: true, metrics });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
