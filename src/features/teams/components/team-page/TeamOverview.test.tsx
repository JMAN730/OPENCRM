import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TeamOverview } from "./TeamOverview";

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: "act-1",
    type: "CALL_LOGGED",
    description: "Logged a call",
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    user: { id: "user-2", name: "Bob", email: "bob@example.com", image: null },
    lead: {
      id: "lead-1",
      firstName: "Jane",
      lastName: "Doe",
      company: "Acme",
      assignedToId: "user-2",
    },
    ...overrides,
  };
}

let activityFeedItems: Array<Record<string, unknown>> = [];

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    teams: {
      activityFeed: {
        useQuery: () => ({
          data: { items: activityFeedItems, nextCursor: null },
          isFetching: false,
        }),
      },
    },
  },
}));

const myTeam = {
  id: "team-1",
  name: "Sales",
  leaderId: "user-1",
  users: [
    { id: "user-1", name: "Alice", email: "alice@example.com", role: "MANAGER", image: null },
    { id: "user-2", name: "Bob", email: "bob@example.com", role: "USER", image: null },
  ],
};

type OverviewProps = Partial<React.ComponentProps<typeof TeamOverview>>;

function renderOverview(props: OverviewProps = {}) {
  return render(
    <TeamOverview
      callerId="user-1"
      isAdmin={false}
      isLeader={false}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      myTeam={myTeam as any}
      {...props}
    />,
  );
}

describe("TeamOverview", () => {
  it("deep-links activity leads to the lead modal for admins", () => {
    activityFeedItems = [makeActivity()];
    renderOverview({ isAdmin: true });

    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute(
      "href",
      "/leads?leadId=lead-1",
    );
  });

  it("deep-links leads assigned to team members for the team leader", () => {
    activityFeedItems = [makeActivity()];
    renderOverview({ isLeader: true });

    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute(
      "href",
      "/leads?leadId=lead-1",
    );
  });

  it("deep-links a member's own assigned lead", () => {
    activityFeedItems = [
      makeActivity({
        lead: {
          id: "lead-1",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme",
          assignedToId: "user-1",
        },
      }),
    ];
    renderOverview();

    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute(
      "href",
      "/leads?leadId=lead-1",
    );
  });

  it("keeps the generic /leads link when the member cannot read the lead", () => {
    // Regular member (not admin, not leader) looking at a teammate's lead:
    // leads.getById would return NOT_FOUND, so a leadId deep link would strand
    // them on /leads with a stale query param and no modal.
    activityFeedItems = [makeActivity()];
    renderOverview();

    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute("href", "/leads");
  });

  it("keeps the generic /leads link for a leader when the lead is assigned outside the team", () => {
    activityFeedItems = [
      makeActivity({
        lead: {
          id: "lead-1",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme",
          assignedToId: "user-99",
        },
      }),
    ];
    renderOverview({ isLeader: true });

    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute("href", "/leads");
  });
});
