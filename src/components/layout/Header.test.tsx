import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/components/layout/WhatsNew", () => ({
  WhatsNew: () => <button>What&apos;s new</button>,
}));

describe("Header", () => {
  beforeEach(() => {
    pathname = "/dashboard";
  });

  it.each([
    ["/map", "Map"],
    ["/pipeline", "Pipeline"],
    ["/messages", "Messages"],
    ["/team/user-1", "Team"],
    ["/trainer", "Trainer"],
    ["/scripts", "Scripts"],
    ["/outreach", "Outreach"],
    ["/calendar", "Calendar"],
    ["/settings/scoring", "Lead Scoring"],
    ["/admin", "Admin"],
  ])("shows the current page title on %s", (route, title) => {
    pathname = route;

    render(<Header />);

    expect(screen.getByText(title, { selector: ".crm-current" })).toBeInTheDocument();
  });
});
