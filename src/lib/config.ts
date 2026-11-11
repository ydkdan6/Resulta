/**
 * Dynamic Platform Configuration
 * 
 * NOTE: As per system rules, the platform name and domain are NEVER hard-coded.
 * They are always resolved dynamically from environment variables.
 */

export interface PlatformConfig {
  name: string;
  domain: string;
  port: number;
  isLocal: boolean;
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    isConfigured: boolean;
  };
  getPlatformUrl: () => string;
  getSchoolResultsUrl: (schoolSlug: string) => string;
  getSchoolStaffUrl: (schoolSlug: string) => string;
}

const rawName = process.env.NEXT_PUBLIC_PLATFORM_NAME || process.env.PLATFORM_NAME || 'Resulta';
const rawDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || process.env.PLATFORM_DOMAIN || 'localhost';
const rawPort = parseInt(process.env.PORT || '3000', 10);
const isLocal = rawDomain === 'localhost' || rawDomain.startsWith('127.') || rawDomain.includes('local');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Validates that real credentials (not placeholders) have been configured
const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('placeholder-project') &&
  !supabaseAnonKey.includes('placeholder-anon-key')
);

export const platformConfig: PlatformConfig = {
  name: rawName,
  domain: rawDomain,
  port: rawPort,
  isLocal,
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
    isConfigured: isSupabaseConfigured,
  },
  getPlatformUrl: () => {
    const protocol = isLocal ? 'http' : 'https';
    const portSuffix = isLocal && rawPort !== 80 && rawPort !== 443 ? `:${rawPort}` : '';
    return `${protocol}://${rawDomain}${portSuffix}`;
  },
  getSchoolResultsUrl: (schoolSlug: string) => {
    const protocol = isLocal ? 'http' : 'https';
    const portSuffix = isLocal && rawPort !== 80 && rawPort !== 443 ? `:${rawPort}` : '';
    return `${protocol}://${schoolSlug}.${rawDomain}${portSuffix}`;
  },
  getSchoolStaffUrl: (schoolSlug: string) => {
    const protocol = isLocal ? 'http' : 'https';
    const portSuffix = isLocal && rawPort !== 80 && rawPort !== 443 ? `:${rawPort}` : '';
    return `${protocol}://${schoolSlug}-staff.${rawDomain}${portSuffix}`;
  },
};
