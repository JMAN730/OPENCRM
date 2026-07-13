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

**Demo Site**:
A generated, per-Lead marketing website shown to a prospect during outreach to demonstrate what their web presence could look like. Must be send-ready without manual rework.
_Avoid_: "demo", "website" unqualified
