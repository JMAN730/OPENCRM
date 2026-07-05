/**
 * The single namespace for Redis key strings (cache entries and rate-limit
 * buckets). Producers, consumers, and invalidators import the same builder,
 * so a changed prefix cannot silently split the namespace across files.
 *
 * Module-local keys with one producer and one consumer in the same file
 * (billing's `billing:sub:*`, team scope's `scope:lead:*`) stay in their
 * modules; everything referenced from more than one place lives here.
 */
export const keys = {
  // ── Cached reads ─────────────────────────────────────────────────────
  dashboardKpi: (organizationId: string) => `dashboard:kpi:${organizationId}`,
  dashboardSidebar: (organizationId: string) => `dashboard:sidebar:${organizationId}`,
  dashboardTeam: (organizationId: string) => `dashboard:team:${organizationId}`,
  aiContext: (scopeKey: string) => `ai:context:${scopeKey}`,
  analyticsTopCallers: (scopeKey: string) => `analytics:topCallers:${scopeKey}`,
  analyticsLeadQuality: (scopeKey: string) => `analytics:leadQuality:${scopeKey}`,
  analyticsRepPerformance: (scopeKey: string) => `analytics:repPerformance:${scopeKey}`,

  // ── Rate-limit buckets ───────────────────────────────────────────────
  aiChatBucket: (userId: string) => `ai:chat:${userId}`,
  authSigninBucket: (email: string) => `auth:signin:${email}`,
  authRegisterIpBucket: (ip: string) => `auth:register:ip:${ip}`,
  authResetEmailBucket: (email: string) => `auth:reset:email:${email}`,
  authResetIpBucket: (ip: string) => `auth:reset:ip:${ip}`,
  authResetConfirmIpBucket: (ip: string) => `auth:reset-confirm:ip:${ip}`,
  acceptInviteIpBucket: (ip: string) => `auth:accept-invite:ip:${ip}`,
  emailSendBucket: (organizationId: string) => `email-send:${organizationId}`,
  emailGenBucket: (organizationId: string, leadId: string) => `email-gen:${organizationId}:${leadId}`,
  demoGenBucket: (organizationId: string, leadId: string) => `demo-gen:${organizationId}:${leadId}`,
  emailTrackIpBucket: (ip: string) => `email-track:${ip}`,
  mapGeocodeBucket: (organizationId: string) => `map:geocode:${organizationId}`,
  mapDiscoverBucket: (organizationId: string) => `map:discover:${organizationId}`,
  trainerScoreBucket: (userId: string) => `trainer:score:${userId}`,
} as const;
