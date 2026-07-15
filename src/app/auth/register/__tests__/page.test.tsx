import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RegisterPage from "../page";
import { getProviders } from "next-auth/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  getProviders: vi.fn().mockResolvedValue(null),
}));

const mockMutateAsync = vi.fn();
vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    auth: {
      register: {
        useMutation: () => ({ mutateAsync: mockMutateAsync }),
      },
    },
  },
}));

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockGetProviders = vi.mocked(getProviders);

describe("RegisterPage Google OAuth integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the Google sign-in button when the provider is configured", async () => {
    mockGetProviders.mockResolvedValueOnce({ google: { id: "google" } } as never);

    render(<RegisterPage />);

    expect(
      await screen.findByRole("button", { name: /continue with google/i })
    ).toBeInTheDocument();
  });

  it("does not show the Google sign-in button when the provider is not configured", async () => {
    mockGetProviders.mockResolvedValueOnce(null);

    render(<RegisterPage />);

    await waitFor(() => expect(mockGetProviders).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: /continue with google/i })
    ).not.toBeInTheDocument();
  });

  it("still renders the credentials registration form alongside the Google button", async () => {
    mockGetProviders.mockResolvedValueOnce({ google: { id: "google" } } as never);

    render(<RegisterPage />);

    await screen.findByRole("button", { name: /continue with google/i });
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });
});