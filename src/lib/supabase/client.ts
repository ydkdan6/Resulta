import { createBrowserClient } from '@supabase/ssr';
import { platformConfig } from '../config';

/**
 * Creates a Supabase client for client-side components.
 * Configured dynamically via platform environment variables.
 */
export function createClient() {
  return createBrowserClient(
    platformConfig.supabase.url,
    platformConfig.supabase.anonKey
  );
}
