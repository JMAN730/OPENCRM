# OpenCRM

OpenCRM is a self-hosted CRM for sales teams managing leads, outreach, tasks, calls, and team-scoped work.

## Language

**Lead visibility**:
The set of Leads and Lead-related records a User is allowed to view or act on, based on their Organization, role, and team relationships. Lead-related records include notes, activities, calls, email drafts, generated websites, tasks, and pipeline deals attached to a Lead.
_Avoid_: Org-only lead access, child-record access

**Category**:
The business niche of a Lead (e.g., Landscaping, Power Washing). Determines which Template Pack its Demo Site uses.
_Avoid_: reading the niche out of Source; "niche" as a separate concept

**Source**:
The provenance of a Lead — where it came from (e.g., a Google Maps scrape, manual entry). Says nothing about what the business does.
_Avoid_: packing Category or location into Source

**Template Pack**:
A per-Category Demo Site design: layout, sections, visual theme, and curated fallback photos. Business-specific copy is filled in per Lead.
_Avoid_: "template" alone (ambiguous with the retired generic templates)

**Touch**:
A recorded call attempt on a Lead — its call outcome set to anything other than NOT_CONTACTED. Calls are made outside the app (the built-in dialer is not in use); updating the outcome is how a call is recorded. Repeat attempts on the same Lead are each their own Touch. The unit behind every "Calls" metric on dashboards.
_Avoid_: "contacted" meaning only the first Touch; treating CallLog (dialer log) rows as the source of call metrics

**Demo Site**:
A generated, per-Lead marketing website shown to a prospect during outreach to demonstrate what their web presence could look like. Must be send-ready without manual rework.
_Avoid_: "demo", "website" unqualified

### Release communication

**Release Note**:
A user-facing announcement of a product change, written in end-user voice, curated by hand, and identified by date (not by version number).
_Avoid_: Changelog entry, update note, version note

**What's New feed**:
The in-app surface that presents Release Notes to logged-in users.
_Avoid_: Changelog page, update changelog

**CHANGELOG.md**:
The dev-facing repo file (Keep a Changelog format) recording technical changes. Not shown to users and not the source of the What's New feed.
