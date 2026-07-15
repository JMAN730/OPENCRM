# Curated in-repo release notes, not CHANGELOG.md and not a database model

The in-app What's New feed needs a content source. We decided to hand-curate user-facing Release Notes in a typed TypeScript file (`src/content/releaseNotes.ts`), keyed by date, rather than parsing `CHANGELOG.md` or storing notes in the database.

## Considered Options

- **Parse CHANGELOG.md** — rejected: entries are dev-voiced (tRPC procedure names, hook fixes), the file is stale relative to git tags, and format drift would break a parser.
- **Database model + admin UI** — rejected: heaviest option; only justified if non-developers author notes or notes vary per organization. Neither is true today.
- **Curated typed file (chosen)** — authoring stays in code review, entries are type-checked at build, no markdown parsing or schema migration.

## Consequences

- Release Notes are identified by date, not version number — the repo's git tags (`v1.0`, `2.8`, `2.8.1`) are too inconsistent to expose to users.
- Any PR that changes user-visible behavior adds a Release Note entry in the same PR; the reviewer enforces this.
- `CHANGELOG.md` remains the dev-facing record and is not shown to users.
