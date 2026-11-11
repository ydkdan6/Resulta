import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { platformConfig } from '../config';

/**
 * Creates a Supabase client for Server Components, Route Handlers, and Server Actions.
 * Safely manages auth cookies using Next.js async cookies store.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    platformConfig.supabase.url,
    platformConfig.supabase.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method can fail in read-only Server Components.
            // This is standard in Next.js App Router and handled via middleware.
          }
        },
      },
    }
  );
}
