// src/app/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import React, { Suspense } from 'react';
import ParentPortalClient from './ParentPortalClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default function ResultsPortalPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F3] p-4">
          <p className="text-xs font-mono text-[#6B645D]">Loading school portal...</p>
        </div>
      }
    >
      <ResultsContent params={params} />
    </Suspense>
  );
}

async function ResultsContent({ params }: PageProps) {
  const resolvedParams = await params;
  const slugHeader = (await headers()).get('x-school-slug');
  const targetSlug = slugHeader || resolvedParams?.slug;

  if (!targetSlug) {
    notFound();
    return null;
  }

  const school = await prisma.school.findUnique({
    where: { slug: targetSlug },
    select: { name: true, logo_url: true, slug: true },
  });

  if (!school) {
    notFound();
    return null;
  }

  return (
    <ParentPortalClient
      schoolSlug={school.slug}
      schoolName={school.name}
      schoolLogo={school.logo_url}
    />
  );
}
