/**
 * Canonical display name for a lead: company first, then contact name, then
 * the caller's fallback. Callers that render leads by contact name first
 * (e.g. the leads list) intentionally do not use this helper.
 */
export function leadDisplayName(
  lead:
    | { company?: string | null; firstName?: string | null; lastName?: string | null }
    | null
    | undefined,
  fallback = "Unnamed",
): string {
  if (!lead) return "";
  return (
    lead.company ||
    [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
    fallback
  );
}
