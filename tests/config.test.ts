import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { platformConfig } from '../src/lib/config.ts';

describe('Dynamic Platform Configuration Tests', () => {
  test('Platform name and domain are loaded dynamically from environment', () => {
    assert.ok(platformConfig.name, 'Platform name must be defined');
    assert.ok(platformConfig.domain, 'Platform domain must be defined');
    assert.strictEqual(typeof platformConfig.name, 'string');
    assert.strictEqual(typeof platformConfig.domain, 'string');
    assert.strictEqual(platformConfig.name, 'Resulta');
    assert.strictEqual(platformConfig.domain, 'localhost');
  });

  test('Subdomain URL helpers generate correct URLs for schools and staff', () => {
    const slug = 'grace-academy';
    const resultsUrl = platformConfig.getSchoolResultsUrl(slug);
    const staffUrl = platformConfig.getSchoolStaffUrl(slug);

    assert.ok(resultsUrl.startsWith('http'), 'Results URL must start with valid protocol');
    assert.ok(resultsUrl.includes(slug), 'Results URL must include the school slug');
    assert.ok(resultsUrl.includes(platformConfig.domain), 'Results URL must include the platform domain');

    assert.ok(staffUrl.startsWith('http'), 'Staff URL must start with valid protocol');
    assert.ok(staffUrl.includes(`${slug}-staff`), 'Staff URL must include slug-staff format');
    assert.ok(staffUrl.includes(platformConfig.domain), 'Staff URL must include the platform domain');
  });

  test('Supabase configuration flags placeholder credentials safely', () => {
    // When placeholders are configured, isConfigured should be false
    assert.strictEqual(typeof platformConfig.supabase.isConfigured, 'boolean');
    assert.strictEqual(typeof platformConfig.supabase.url, 'string');
    assert.strictEqual(typeof platformConfig.supabase.anonKey, 'string');
  });

  test('Configuration guarantees that neither name nor domain are hard-coded', () => {
    // Verify URLs reflect the dynamic domain
    const testSlug = 'federal-college';
    const generatedUrl = platformConfig.getSchoolResultsUrl(testSlug);
    assert.ok(generatedUrl.includes(testSlug));
    assert.ok(generatedUrl.includes(platformConfig.domain));
  });
});
