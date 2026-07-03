import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RootPage from "../page";
import { useSession } from "next-auth/react";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: null, status: "unauthenticated" })),
}));

const mockUseSession = vi.mocked(useSession);

describe("Landing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);
  });

  it("renders the hero headline and primary CTA to register", () => {
    render(<RootPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /automate leads/i })
    ).toBeInTheDocument();

    const primaryCta = screen.getByRole("link", { name: /start for free/i });
    expect(primaryCta).toHaveAttribute("href", "/auth/register");
  });

  it("shows sign-in and get-started links when unauthenticated", () => {
    render(<RootPage />);

    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/auth/signin"
    );
    expect(within(nav).getByRole("link", { name: /get started/i })).toHaveAttribute(
      "href",
      "/auth/register"
    );
    expect(
      screen.queryByRole("link", { name: /go to dashboard/i })
    ).not.toBeInTheDocument();
  });

  it("shows a dashboard link instead of auth CTAs when authenticated", () => {
    mockUseSession.mockReturnValue({
      data: { user: { name: "Test User" }, expires: "" },
      status: "authenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    render(<RootPage />);

    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    const nav = screen.getByRole("navigation");
    expect(
      within(nav).queryByRole("link", { name: /get started/i })
    ).not.toBeInTheDocument();
    expect(
      within(nav).queryByRole("link", { name: /sign in/i })
    ).not.toBeInTheDocument();
  });

  it("renders the main marketing sections", () => {
    render(<RootPage />);

    expect(
      screen.getByRole("heading", { name: /everything your sales team needs/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /from cold list to closed deal/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /simple plans that grow with you/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /frequently asked questions/i })
    ).toBeInTheDocument();
  });

  it("links every pricing tier to registration", () => {
    const { container } = render(<RootPage />);

    const pricing = container.querySelector("#pricing");
    expect(pricing).not.toBeNull();
    const tierLinks = within(pricing as HTMLElement).getAllByRole("link", {
      name: /get started/i,
    });
    expect(tierLinks).toHaveLength(3);
    tierLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/auth/register");
    });
  });
});
