/**
 * Feature flags for gating incomplete or in-progress features.
 *
 * Flip a flag to `true` to re-enable a feature once it is finished. Flags are
 * plain constants so both the navigation and the route can gate on the same
 * source of truth without a runtime lookup.
 */

/**
 * Voice call trainer (`/trainer`). Disabled until the feature is finished.
 * See https://github.com/JMAN730/OPENCRM/issues/258.
 */
export const TRAINER_ENABLED = false;

/**
 * Browser dialer (`/dialer`). Disabled until the feature is finished.
 * See https://github.com/JMAN730/OPENCRM/pull/266.
 */
export const DIALER_ENABLED = false;

/**
 * Sales scripts (`/scripts`). Disabled until the feature is finished.
 * See https://github.com/JMAN730/OPENCRM/pull/266.
 */
export const SCRIPTS_ENABLED = false;
