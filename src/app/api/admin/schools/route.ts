import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requirePlatformAdmin();

    const schools = await prisma.school.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            classes: true,
            students: true,
          },
        },
      },
    });

    return NextResponse.json({ schools });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to retrieve schools.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();

    const body = await request.json();
    const { name, slug, logo_url, card_price, platform_share } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: 'School name and slug are required.' },
        { status: 400 }
      );
    }

    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');

    const existing = await prisma.school.findUnique({
      where: { slug: cleanSlug },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A school with this subdomain slug already exists.' },
        { status: 400 }
      );
    }

    const school = await prisma.school.create({
      data: {
        name: name.trim(),
        slug: cleanSlug,
        logo_url: logo_url || null,
        card_price: card_price !== undefined ? parseFloat(card_price) : 2000.00,
        platform_share: platform_share !== undefined ? parseFloat(platform_share) : 1000.00,
      },
    });

    return NextResponse.json({ school }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Create school error:', error);
    return NextResponse.json({ error: 'Failed to create school.' }, { status: 500 });
  }
}
