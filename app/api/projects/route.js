import { NextResponse } from 'next/server';
import { getProjects, saveProjects } from '@/lib/projects';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const projects = getProjects();
    return NextResponse.json({ success: true, projects });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { projects } = body;

    if (!Array.isArray(projects)) {
      return NextResponse.json(
        { success: false, error: 'Expected "projects" to be an array' },
        { status: 400 }
      );
    }

    // Validate project schema
    for (const p of projects) {
      if (!p.name || !p.path || !p.branch || !p.pm2Name) {
        return NextResponse.json(
          {
            success: false,
            error: 'Each project must include name, path, branch, and pm2Name'
          },
          { status: 400 }
        );
      }
      p.id = p.id || p.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      p.buildCommand = p.buildCommand || 'npm run build';
    }

    saveProjects(projects);
    return NextResponse.json({ success: true, projects });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
