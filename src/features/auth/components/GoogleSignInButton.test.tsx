import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const { mockSignIn, mockGetProviders, mockToastError } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockGetProviders: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
  getProviders: mockGetProviders,
}));
vi.mock("sonner", () => ({
  toast: { error: mockToastError },
}));

import { GoogleSignInButton } from "./GoogleSignInButton";

beforeEach(() => {
  vi.clearAllMocks();
  mockSignIn.mockResolvedValue(undefined);
});

describe("GoogleSignInButton", () => {
  it("renders the button when the Google provider is configured", async () => {
    mockGetProviders.mockResolvedValue({ google: { id: "google" } });

    render(<GoogleSignInButton />);

    expect(
      await screen.findByRole("button", { name: /continue with google/i })
    ).toBeInTheDocument();
  });

  it("renders nothing when the Google provider is not configured", async () => {
    mockGetProviders.mockResolvedValue({ credentials: { id: "credentials" } });

    render(<GoogleSignInButton />);

    await waitFor(() => expect(mockGetProviders).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: /continue with google/i })
    ).not.toBeInTheDocument();
  });

  it("starts the Google OAuth flow targeting the dashboard on click", async () => {
    mockGetProviders.mockResolvedValue({ google: { id: "google" } });

    render(<GoogleSignInButton />);

    fireEvent.click(
      await screen.findByRole("button", { name: /continue with google/i })
    );

    expect(mockSignIn).toHaveBeenCalledWith("google", {
      callbackUrl: "/dashboard",
    });
  });

  it("reports an OAuth kickoff failure and lets the user retry", async () => {
    mockGetProviders.mockResolvedValue({ google: { id: "google" } });
    mockSignIn.mockRejectedValueOnce(new Error("network down"));

    render(<GoogleSignInButton />);

    const button = await screen.findByRole("button", {
      name: /continue with google/i,
    });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Couldn't start Google sign-in. Please try again."
      );
    });
    expect(button).toBeEnabled();
  });
});
