import { SuppressionRecord } from '../types.ts';

/**
 * Checks whether an email address is blocked by any record in the suppression list.
 * Handles exact email matches as well as whole-domain blocks (e.g. '@company.com' or 'company.com').
 */
export function isEmailSuppressed(email: string, suppressionList: SuppressionRecord[]): { suppressed: boolean; matchedRecord?: SuppressionRecord } {
  if (!email || typeof email !== 'string') return { suppressed: true };
  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.includes('@') ? normalizedEmail.split('@')[1] : '';

  for (const record of suppressionList) {
    const item = record.emailOrDomain.trim().toLowerCase().replace(/^@/, '');
    if (normalizedEmail === item) {
      return { suppressed: true, matchedRecord: record };
    }
    if (domain && (domain === item || item === `@${domain}`)) {
      return { suppressed: true, matchedRecord: record };
    }
  }

  return { suppressed: false };
}

/**
 * Validates outreach campaign before sending.
 * Returns valid recipients and blocked recipients.
 */
export function filterSuppressedRecipients<T extends { email: string }>(
  recipients: T[],
  suppressionList: SuppressionRecord[]
): { allowed: T[]; blocked: { recipient: T; reason: string }[] } {
  const allowed: T[] = [];
  const blocked: { recipient: T; reason: string }[] = [];

  for (const r of recipients) {
    const check = isEmailSuppressed(r.email, suppressionList);
    if (check.suppressed) {
      blocked.push({
        recipient: r,
        reason: check.matchedRecord ? `Suppressed (${check.matchedRecord.reason})` : 'Invalid or suppressed email',
      });
    } else {
      allowed.push(r);
    }
  }

  return { allowed, blocked };
}
