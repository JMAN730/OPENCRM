"use client";

import { Gift } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { RELEASE_NOTES, type ReleaseNoteTag } from "@/content/releaseNotes";

export const LAST_SEEN_STORAGE_KEY = "whatsnew:lastSeen";

const PANEL_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 340,
  maxHeight: 420,
  overflowY: "auto",
  padding: "8px 0",
  zIndex: 200,
  boxShadow: "0 4px 24px rgba(0,0,0,.18)",
  borderRadius: "var(--crm-radius-md)",
  animation: "crm-fade-in 0.12s ease-out",
};

const TAG_COLORS: Record<ReleaseNoteTag, { bg: string; fg: string }> = {
  New: { bg: "var(--crm-accent)", fg: "#fff" },
  Improved: { bg: "var(--crm-surface-2)", fg: "var(--crm-fg)" },
  Fixed: { bg: "var(--crm-surface-2)", fg: "var(--crm-fg-faint)" },
};

// Dates can repeat across notes, so the seen marker includes the title too —
// a new note on an already-seen date still shows the dot.
const newestKey = RELEASE_NOTES[0]
  ? `${RELEASE_NOTES[0].date}::${RELEASE_NOTES[0].title}`
  : "";

const LAST_SEEN_EVENT = "whatsnew:lastseen";

// localStorage can throw in restricted-storage contexts (private browsing,
// storage-blocked embeds, quota errors); fall back to an in-memory value so
// only persistence is lost, not the whole header.
let inMemoryLastSeen: string | null = null;
const readLastSeen = () => {
  try {
    return localStorage.getItem(LAST_SEEN_STORAGE_KEY);
  } catch {
    return inMemoryLastSeen;
  }
};
const writeLastSeen = (value: string) => {
  inMemoryLastSeen = value;
  try {
    localStorage.setItem(LAST_SEEN_STORAGE_KEY, value);
  } catch {
    // Persistence unavailable; the in-memory value keeps this session correct.
  }
};

const subscribeToLastSeen = (cb: () => void) => {
  window.addEventListener(LAST_SEEN_EVENT, cb);
  return () => window.removeEventListener(LAST_SEEN_EVENT, cb);
};
const getUnreadSnapshot = () => {
  return newestKey !== "" && readLastSeen() !== newestKey;
};
// Server render never shows the dot; localStorage only exists on the client.
const getServerUnreadSnapshot = () => false;

export function WhatsNew({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const hasUnread = useSyncExternalStore(
    subscribeToLastSeen,
    getUnreadSnapshot,
    getServerUnreadSnapshot,
  );

  useEffect(() => {
    if (open && newestKey) {
      writeLastSeen(newestKey);
      window.dispatchEvent(new Event(LAST_SEEN_EVENT));
    }
  }, [open]);

  return (
    <>
      <button
        className="crm-btn ghost icon"
        type="button"
        title="What's new"
        aria-label="What's new"
        aria-pressed={open}
        onClick={onToggle}
        style={{ position: "relative" }}
      >
        <Gift size={15} />
        {hasUnread && (
          <span
            data-testid="whatsnew-unread-dot"
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--crm-accent)",
            }}
          />
        )}
      </button>

      {open && (
        <div className="crm-card" style={PANEL_STYLE}>
          <div
            style={{
              padding: "6px 16px 10px",
              borderBottom: "1px solid var(--crm-border)",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            What&apos;s new
          </div>
          {RELEASE_NOTES.map((note) => (
            <div
              key={`${note.date}-${note.title}`}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--crm-border)",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 8px",
                    borderRadius: 20,
                    background: TAG_COLORS[note.tag].bg,
                    color: TAG_COLORS[note.tag].fg,
                  }}
                >
                  {note.tag}
                </span>
                <span style={{ color: "var(--crm-fg-faint)", fontSize: 11 }}>{note.date}</span>
              </div>
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{note.title}</h3>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--crm-fg-faint)", margin: 0 }}>
                {note.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
