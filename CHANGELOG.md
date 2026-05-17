# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public release with core CRM features
- Lead management system with pipeline tracking
- Dashboard with real-time sales metrics
- Task management system
- Manual call outcome logging and call history; interactive dialer disabled pending funded Twilio integration
- Analytics dashboard with call charts and pipeline breakdown
- Template-based website generator per lead
- Multi-tenant architecture with organization isolation
- Authentication with NextAuth.js
- Comprehensive test suite with Vitest

### Changed (2026-05-17)

- **CSV Export**: `leads.export` tRPC procedure returns a filtered CSV of up to 10,000 leads; Export CSV button in LeadsManagementBar triggers browser download.
- **Bulk temperature**: `leads.bulkSetTemperature` sets HOT / WARM / COOL override (or clears it) on multiple leads; Temperature dropdown in LeadBulkActionBar.
- **AI lead qualification**: `leads.generateQualification` produces a 2–3 sentence qualification summary via OpenAI (heuristic fallback when `OPENAI_API_KEY` is unset); Qualify button in LeadModal stores summary on the lead.
- **Custom scraper categories**: `OrgScraperCategory` model; `scraper.createCategory` / `deleteCategory` / `listCategories` procedures; org-specific categories managed inline in StartJobForm.
- **Scheduled weekly scraper runs**: `ScheduledScrape` model; `scraperSchedules` top-level router; ScheduledScrapePanel UI; `/api/cron/scraper` POST endpoint executes due schedules; next-run date shown in UI.
- **Pipeline revenue forecasting**: `pipeline.updateDealValue` mutation; inline editable deal values on PipelineBoard; Forecast tab (close-rate weighted totals); Table tab (all deals with value editing).
- **Scoring rules wired into lead list**: All score displays and score-based sorting/filtering now use admin-configured factor weights instead of hardcoded defaults.

### Fixed (2026-05-17)

- Duplicate lead IDs in `bulkDelete` and `bulkSetTemperature` no longer trigger a false FORBIDDEN (deduplicated before scope check).
- Hooks-rules violation in PipelineBoard (`filterLeads` useCallback after early return) fixed.
- Unescaped quotes in ScheduledScrapePanel JSX replaced with HTML entities.

### Security

- Input validation on all tRPC procedures using Zod
- Authentication and authorization on all protected endpoints
- Secure session management with JWT
- Environment variable validation
- `/api/cron/scraper` protected by optional `CRON_SECRET` bearer token

## [0.1.0] - 2026-04-19

### Added

- Initial project setup
- Next.js 15 with App Router
- tRPC API layer
- Prisma ORM with PostgreSQL
- Shadcn/UI component library
- NextAuth.js authentication
- Vitest testing framework
- ESLint configuration
- TypeScript configuration

[Unreleased]: https://github.com/yourusername/crm/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/crm/releases/tag/v0.1.0
