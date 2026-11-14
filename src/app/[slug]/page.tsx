// src/app/[slug]/page.tsx
// Results portal for a school (slug.<domain>)
// Shows the school's name and logo, and a PIN login form.

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export default async function ResultsPortalPage() {
  // The middleware populates the x-school-slug header
  const slugHeader = headers().get('x-school-slug');
  if (!slugHeader) {
    // No slug means this is not a results subdomain – let Next handle 404
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

  // Simple PIN login form – no actual verification yet
  // Submitting will just display a placeholder message.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // eslint-disable-next-line no-alert
    alert('PIN login not available yet.');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow">
        {school.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={school.logo_url} alt={`${school.name} logo`} className="mx-auto mb-4 h-16" />
        )}
        <h1 className="text-center text-2xl font-bold mb-4">{school.name} Results Portal</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium" htmlFor="admission">Admission Number</label>
            <input id="admission" name="admission" type="text" required className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="pin">PIN</label>
            <input id="pin" name="pin" type="password" required className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" />
          </div>
          <button type="submit" className="w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">Login</button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">Not available yet – contact your school for assistance.</p>
      </div>
    </div>
  );
}
