import { NextResponse } from 'next/server';
import { executeProjectAction } from '@/lib/executor';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { projectId, action, options } = body;

    if (!projectId || !action) {
      return NextResponse.json(
        { success: false, error: 'Both "projectId" and "action" are required.' },
        { status: 400 }
      );
    }

    const result = await executeProjectAction(projectId, action, options);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        stdout: '',
        stderr: err.message
      },
      { status: 400 }
    );
  }
}
