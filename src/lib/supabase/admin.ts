import { createClient } from '@supabase/supabase-js';
import { platformConfig } from '../config';

/**
 * Privileged Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * STRICTLY SERVER-ONLY. Never expose or invoke from client-side code.
 * Used for platform admin operations and secure backend automations.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient must only be executed on the server.');
  }

  const { url, serviceRoleKey } = platformConfig.supabase;

  if (!url || !serviceRoleKey || serviceRoleKey.includes('placeholder')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not properly configured.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
