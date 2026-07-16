export type ReleaseNoteTag = "New" | "Improved" | "Fixed";

export interface ReleaseNote {
  /** ISO date (YYYY-MM-DD), shown to users instead of a version number. Several notes may share a date. */
  date: string;
  title: string;
  tag: ReleaseNoteTag;
  body: string;
}

// Keep newest-first. Any PR that changes user-visible behavior adds an entry
// here in the same PR (see docs/adr/0003-curated-release-notes.md).
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "2026-07-16",
    title: "Clearer lead counts and navigation",
    tag: "Fixed",
    body: "Lead lists now distinguish the current page from all matching leads, page headers follow your location, wide lead tables stay readable, and Analytics labels each reporting period clearly.",
  },
  {
    date: "2026-07-01",
    title: "Lead Map",
    tag: "New",
    body: "Discover businesses on an interactive map. Pan to any area, select pins, and enrich leads with contact details before importing them.",
  },
  {
    date: "2026-07-01",
    title: "Subscriptions & billing",
    tag: "New",
    body: "Manage your plan from Settings → Billing: upgrade, view seat usage, and update payment details through the secure billing portal.",
  },
  {
    date: "2026-06-14",
    title: "Automated outreach queue",
    tag: "New",
    body: "Scraped leads can now flow into an outreach queue that prepares a demo site and email draft for each one. Review everything at /outreach — nothing sends without you.",
  },
  {
    date: "2026-05-17",
    title: "Lead tags",
    tag: "New",
    body: "Organize leads with custom tags. Create tags in Settings, apply them from the lead panel, and filter your lead list by tag.",
  },
  {
    date: "2026-05-17",
    title: "CSV export",
    tag: "New",
    body: "Export your filtered lead list to CSV with one click from the leads page.",
  },
  {
    date: "2026-05-17",
    title: "AI lead qualification",
    tag: "New",
    body: "Get a short AI-written qualification summary for any lead with the Qualify button in the lead panel.",
  },
  {
    date: "2026-05-16",
    title: "Dark mode",
    tag: "New",
    body: "Toggle between light and dark themes from the header — your choice is remembered.",
  },
];
