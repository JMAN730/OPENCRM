import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useState } from "react";
import { WhatsNew, LAST_SEEN_STORAGE_KEY } from "./WhatsNew";
import { RELEASE_NOTES } from "@/content/releaseNotes";

// Stateful harness mirroring how Header controls the panel.
function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return <WhatsNew open={open} onToggle={() => setOpen((o) => !o)} />;
}

const newestDate = RELEASE_NOTES[0].date;

describe("WhatsNew", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders release notes newest-first with title, date, and tag when open", () => {
    render(<Harness initialOpen />);

    for (const note of RELEASE_NOTES) {
      expect(screen.getByText(note.title)).toBeInTheDocument();
      expect(screen.getAllByText(note.date).length).toBeGreaterThan(0);
      expect(screen.getAllByText(note.tag).length).toBeGreaterThan(0);
    }

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(
      RELEASE_NOTES.map((n) => n.title),
    );

    const sorted = [...RELEASE_NOTES.map((n) => n.date)].sort().reverse();
    expect(RELEASE_NOTES.map((n) => n.date)).toEqual(sorted);
  });

  it("shows the unread dot when nothing has been seen yet", () => {
    render(<Harness />);
    expect(screen.getByTestId("whatsnew-unread-dot")).toBeInTheDocument();
  });

  it("shows the unread dot when last-seen is older than the newest note", () => {
    localStorage.setItem(LAST_SEEN_STORAGE_KEY, "2020-01-01");
    render(<Harness />);
    expect(screen.getByTestId("whatsnew-unread-dot")).toBeInTheDocument();
  });

  it("hides the unread dot when the newest note has been seen", () => {
    localStorage.setItem(LAST_SEEN_STORAGE_KEY, newestDate);
    render(<Harness />);
    expect(screen.queryByTestId("whatsnew-unread-dot")).not.toBeInTheDocument();
  });

  it("clears the dot and persists the newest date when the panel opens", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /what's new/i }));

    expect(screen.queryByTestId("whatsnew-unread-dot")).not.toBeInTheDocument();
    expect(localStorage.getItem(LAST_SEEN_STORAGE_KEY)).toBe(newestDate);
  });
});
