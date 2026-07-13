# Demo Sites are built from hand-crafted Template Packs, not AI-generated HTML

Demo Sites must be send-ready without manual rework, at cron volume, at near-zero marginal cost. We decided that each Demo Site is rendered from a hand-crafted per-Category Template Pack (layout, sections, visual theme, curated fallback photos), with AI producing only the business-specific copy — validated against a schema and falling back to deterministic per-niche copy on any failure.

## Considered Options

- **Full AI generation** (model writes complete HTML per lead): highest quality ceiling and matches the manual workflow it replaces, but real per-demo cost, unbounded output variance ("remake lottery"), and no way to QA every site at cron volume. Rejected.
- **Template Packs + AI copy** (chosen): quality is controlled by one-time design work instead of per-call model luck; marginal cost stays ~$0.001/demo; a broken AI response degrades to deterministic copy instead of a broken site.

## Consequences

- Supporting a new business Category means designing a new pack (or accepting the generic fallback pack) — it is deliberate design work, not a prompt tweak.
- Copy quality depends on clean structured inputs (`Lead.category`, city, qualification summary), not on `Lead.source`, which is provenance only.
- A demo must always exist for every lead the pipeline touches: no generation path may hard-fail on AI errors.
