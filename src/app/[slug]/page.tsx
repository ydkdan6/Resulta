// src/app/[slug]/page.tsx
// Results portal for a school (slug.<domain>)
// Shows the school's name and logo, and a PIN login form.

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import React, { Suspense } from 'react';
import PinLoginForm from './PinLoginForm';

export default function ResultsPortalPage() {
  // Render the UI inside Suspense; header reading happens in child component.
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-100 p-4"><p>Loading…</p></div>}>
      <ResultsContent />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Child component that performs the Prisma query. It runs as a server component.
// ---------------------------------------------------------------------------
async function ResultsContent() {
  // Read the slug header inside this server component.
  const slugHeader = (await headers()).get('x-school-slug');
  if (!slugHeader) {
    notFound();
    return null;
  }

  const school = await prisma.school.findUnique({
    where: { slug: slugHeader },
    select: { name: true, logo_url: true },
  });

  if (!school) {
    notFound();
    return null;
  }

  // Render the UI; the form is a client component.
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
        {school.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={school.logo_url} alt={`${school.name} logo`} className="mx-auto mb-4 h-16" />
        )}
        <h1 className="text-center text-2xl font-bold mb-4">{school.name} Results Portal</h1>
        <PinLoginForm />
        <p className="mt-4 text-center text-sm text-gray-500">Not available yet? contact your school for assistance.</p>
      </div>
    </div>
  );
}
