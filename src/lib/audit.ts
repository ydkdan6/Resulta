// src/lib/audit.ts
/**
 * Simple audit log helper.
 * Records an audit entry without storing any personally identifiable student data.
 * In a real project this would persist to a database table or external logging service.
 */
export async function recordAuditLog(params: {
  action: string;
  schoolId: string;
  details?: Record<string, unknown>;
}) {
  // Redact any sensitive information – ensure we only log what is safe.
  const safeDetails = params.details ? JSON.parse(JSON.stringify(params.details)) : undefined;
  const entry = {
    action: params.action,
    schoolId: params.schoolId,
    details: safeDetails,
    timestamp: new Date().toISOString(),
  };
  // For development we just console.log; replace with DB write in production.
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AUDIT]', JSON.stringify(entry));
  }
}
