import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TeamOverview } from "./TeamOverview";

const activityFeedData = {
  items: [
    {
      id: "act-1",
      type: "CALL_LOGGED",
      description: "Logged a call",
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      user: { id: "user-2", name: "Bob", email: "bob@example.com", image: null },
      lead: { id: "lead-1", firstName: "Jane", lastName: "Doe", company: "Acme" },
    },
  ],
  nextCursor: null,
};

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    teams: {
      activityFeed: {
        useQuery: () => ({ data: activityFeedData, isFetching: false }),
      },
    },
  },
}));

const myTeam = {
  id: "team-1",
  name: "Sales",
  leaderId: "user-1",
  users: [
    { id: "user-1", name: "Alice", email: "alice@example.com", role: "ADMIN", image: null },
  ],
};

describe("TeamOverview", () => {
  it("links activity leads to the leads page with the lead modal open", () => {
    render(
      <TeamOverview
        callerId="user-1"
        isAdmin={true}
        isLeader={false}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        myTeam={myTeam as any}
      />,
    );

    const leadLink = screen.getByRole("link", { name: "Jane Doe" });
    expect(leadLink).toHaveAttribute("href", "/leads?leadId=lead-1");
  });
});
