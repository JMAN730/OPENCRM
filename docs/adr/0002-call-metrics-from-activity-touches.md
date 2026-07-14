# Call metrics come from Activity touches, not CallLog

Reps call leads outside the app (the built-in Twilio dialer is not in use) and record each call by setting the lead's call outcome. Every "Calls" metric — dashboard Overview (recent calls, calls today, sparklines, answered, answer rate), My Stats, Team Stats, /analytics, team member detail — is therefore sourced from Touch events (`Activity` rows of type `CALL_OUTCOME` with a structured outcome ≠ `NOT_CONTACTED`), not from the `CallLog` table. We replaced the source rather than merging the two, so dialer-logged calls do not count unless they also update the lead's outcome.

## Consequences

- `Activity` gained a nullable structured outcome column, written by `leads.updateCallOutcome`; pre-existing rows were backfilled by parsing the fixed-template description text.
- A touch is an event: three outcome updates on one lead in a day count as three calls.
- Answer rate = touches with outcome `ANSWERED` / all touches.
- `CallLog` remains in the schema (dialer WIP) but feeds no UI metrics.
