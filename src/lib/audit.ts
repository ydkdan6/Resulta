// src/lib/audit.ts
import { prisma } from '@/lib/prisma';
import { sanitizeData } from '@/lib/logger';

export interface AuditLogParams {
  action: string;
  schoolId?: string | null;
  userId?: string | null;
  entity?: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Universal audit log helper.
 * Records an audit entry in the database without storing any sensitive personal or credential data (e.g. PINs, passwords).
 */
export async function recordAuditLog(params: AuditLogParams): Promise<void> {
  const safeDetails = params.details ? sanitizeData(params.details) : undefined;
  const safeOldValues = params.oldValues ? sanitizeData(params.oldValues) : undefined;
  const safeNewValues = params.newValues
    ? sanitizeData(params.newValues)
    : safeDetails
    ? (safeDetails as Record<string, unknown>)
    : undefined;

  const entry = {
    action: params.action,
    schoolId: params.schoolId,
    details: safeDetails,
    timestamp: new Date().toISOString(),
  };

  // Safe console log for development, always sanitized
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AUDIT]', JSON.stringify(entry));
  }

  // Persist to database
  try {
    if (prisma?.auditLog?.create) {
      await prisma.auditLog.create({
        data: {
          action: params.action,
          school_id: params.schoolId || null,
          user_id: params.userId || null,
          entity: params.entity || 'General',
          entity_id: params.entityId || null,
          old_values: safeOldValues ? (safeOldValues as any) : undefined,
          new_values: safeNewValues ? (safeNewValues as any) : undefined,
          reason: params.reason ? String(params.reason).slice(0, 500) : null,
        },
      });
    }
  } catch {
    // Audit logging failure should not crash the request in isolated unit tests
  }
}
