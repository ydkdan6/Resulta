// src/app/api/admin/schools/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const RESERVED_SLUGS = new Set(['admin', 'www', 'api', 'staff', 'results']);

/**
 * Clean and validate a school slug.
 * - lower‑case letters and numbers only, hyphens allowed
 * - collapse multiple hyphens, trim leading/trailing hyphens
 * - limit length to 30 characters
 * - reject reserved words and any slug ending with "-staff"
 */
export function cleanSlug(input: string): string {
  // Replace illegal characters with hyphen
  let slug = input.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  // Collapse consecutive hyphens
  slug = slug.replace(/-+/g, '-');
  // Trim hyphens from start/end
  slug = slug.replace(/^[-]+|[-]+$/g, '');
  // Enforce max length
  if (slug.length > 30) slug = slug.substring(0, 30);
  return slug;
}

/** Validate the slug against reserved list and "-staff" suffix */
function validateSlug(slug: string): string | null {
  if (RESERVED_SLUGS.has(slug) || slug.endsWith('-staff')) {
    return 'Slug is reserved or invalid and cannot be used.';
  }
  return null;
}

/** Process logo upload (multipart/form-data). Returns public URL or null */
async function processLogoUpload(formData: FormData): Promise<string | null> {
  const file = formData.get('logo') as File | null;
  if (!file) return null; // No logo supplied

  const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
  if (file.size > MAX_SIZE) {
    throw new Error('Logo file exceeds 2 MB size limit.');
  }

  const allowed = ['image/png', 'image/jpeg'];
  if (!allowed.includes(file.type)) {
    throw new Error('Logo must be a PNG or JPEG image.');
  }

  // Read buffer
  const buffer = Buffer.from(await file.arrayBuffer());
  const sharp = (await import('sharp')).default;
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!['png', 'jpeg', 'jpg'].includes(metadata.format ?? '')) {
    throw new Error('Uploaded file is not a valid PNG/JPEG image.');
  }

  // Resize to max 800x800 keeping aspect ratio
  const resized = await image.resize({ width: 800, height: 800, fit: 'inside' }).toBuffer();

  // Upload to Supabase storage (public bucket)
  const { supabase } = await import('@/lib/supabase');
  const ext = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
  const fileName = `school-logos/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from('public')
    .upload(fileName, resized, { contentType: file.type, upsert: false });
  if (error) {
    throw new Error('Failed to upload logo: ' + error.message);
  }
  const { data: publicData } = supabase.storage.from('public').getPublicUrl(data.path);
  const publicUrl = publicData?.publicUrl ?? '';
  return publicUrl;
}

// ---------------------------------------------------------------------------
// GET – list schools (admin only) — paginated
// ---------------------------------------------------------------------------
export async function GET(request?: NextRequest) {
  try {
    await requirePlatformAdmin(undefined, request);

    // Pagination: ?page=1&pageSize=50 (default 50, max 200)
    const url = request ? new URL(request.url) : null;
    const page = Math.max(1, Number(url?.searchParams.get('page') ?? '1') || 1);
    const rawPageSize = Number(url?.searchParams.get('pageSize') ?? '50') || 50;
    const pageSize = Math.min(200, Math.max(1, rawPageSize));
    const skip = (page - 1) * pageSize;

    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        include: { _count: { select: { users: true, classes: true, students: true } } },
      }),
      prisma.school.count(),
    ]);

    return NextResponse.json({ schools, total, page, pageSize });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'Failed to retrieve schools.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST – create a new school (admin only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin(undefined, request);
    const contentType = request.headers.get('content-type') ?? '';

    let name: string | undefined;
    let rawSlug: string | undefined;
    let logoUrl: string | null = null;
    let card_price: string | undefined;
    let platform_share: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      name = (form.get('name') as string)?.trim();
      rawSlug = (form.get('slug') as string)?.trim();
      card_price = (form.get('card_price') as string) ?? undefined;
      platform_share = (form.get('platform_share') as string) ?? undefined;
      try {
        logoUrl = await processLogoUpload(form);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
    } else {
      const body = await request.json();
      name = body.name?.trim();
      rawSlug = body.slug?.trim();
      logoUrl = body.logo_url || null;
      card_price = body.card_price;
      platform_share = body.platform_share;
    }

    if (!name || !rawSlug) {
      return NextResponse.json({ error: 'School name and slug are required.' }, { status: 400 });
    }

    const slug = cleanSlug(rawSlug);
    const validationError = validateSlug(slug);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Ensure uniqueness – Prisma unique constraint also guards this.
    const existing = await prisma.school.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: 'A school with this subdomain slug already exists.' }, { status: 400 });
    }

    // Default values if not supplied
    const cardPriceNum = card_price !== undefined ? parseFloat(card_price) : 1000.0;
    const platformShareNum = platform_share !== undefined ? parseFloat(platform_share) : 500.0;

    const school = await prisma.school.create({
      data: {
        name,
        slug,
        logo_url: logoUrl,
        card_price: cardPriceNum,
        platform_share: platformShareNum,
      },
    });

    return NextResponse.json({ school }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Slug must be unique.' }, { status: 400 });
    }
    logger.error('Create school error:', err);
    return NextResponse.json({ error: 'Failed to create school.' }, { status: 500 });
  }
}
