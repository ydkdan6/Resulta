// src/app/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import React, { Suspense } from 'react';
import ParentPortalClient from './ParentPortalClient';

export default function ResultsPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F3] p-4">
          <p className="text-xs font-mono text-[#6B645D]">Loading school portal...</p>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}

async function ResultsContent() {
  const slugHeader = (await headers()).get('x-school-slug');
  if (!slugHeader) {
    notFound();
    return null;
  }

  const school = await prisma.school.findUnique({
    where: { slug: slugHeader },
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
