import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SignInPage from "../page";
import { signIn, getSession } from "next-auth/react";

// Mock Next.js router
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

// Mock next-auth
vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  getSession: vi.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

// Mock tRPC
vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({}),
    auth: {
      resetPassword: {
        useMutation: () => ({ mutate: vi.fn(), isLoading: false }),
      },
    },
  },
}));

// Mock ResizeObserver for shadcn/ui components if needed
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockSignIn = vi.mocked(signIn);
const mockGetSession = vi.mocked(getSession);

describe("SignIn Page Authentication Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage before each test
    localStorage.clear();
    // Reset window.location.href mock
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
  });

  it("handles successful login and redirects to dashboard", async () => {
    // Arrange
    mockSignIn.mockResolvedValueOnce({ error: null, ok: true, status: 200, url: null });
    mockGetSession.mockResolvedValueOnce({
      user: {
        id: "user-1",
        role: "ADMIN",
        organizationId: "org-1",
        teamId: null,
        email: "test@example.com",
        name: "Test User",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    render(<SignInPage />);

    // Act
    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitButton);

    // Assert
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "test@example.com",
      password: "password123",
      redirect: false,
    });

    await waitFor(() => {
      // It should load session
      expect(getSession).toHaveBeenCalled();
      // It should set window.location.href (or redirect)
      expect(window.location.href).toBe("/dashboard");
    });
  });

  it("handles invalid credentials by showing an error message", async () => {
    // Arrange
    mockSignIn.mockResolvedValueOnce({ error: "CredentialsSignin", ok: false, status: 401, url: null });

    render(<SignInPage />);

    // Act
    const emailInput = screen.getByLabelText(/Email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    const submitButton = screen.getByRole("button", { name: /Sign In/i });

    fireEvent.change(emailInput, { target: { value: "wrong@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "wrongpass" } });
    fireEvent.click(submitButton);

    // Assert
    expect(signIn).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText(/Incorrect email or password/i)).toBeInTheDocument();
    });

    // Should not fetch session or redirect
    expect(getSession).not.toHaveBeenCalled();
    expect(window.location.href).toBe("");
  });

  it("saves the session and user to localStorage on success", async () => {
    // Arrange
    mockSignIn.mockResolvedValueOnce({ error: null, ok: true, status: 200, url: null });
    mockGetSession.mockResolvedValueOnce({
      user: {
        id: "user-1",
        role: "ADMIN",
        organizationId: "org-1",
        teamId: null,
        email: "jonas@example.com",
        name: "jonas",
        image: "https://example.com/jonas.png",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    render(<SignInPage />);

    // Act
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: "jonas@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: "pass" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign In/i }));

    // Assert
    await waitFor(() => {
      expect(window.location.href).toBe("/dashboard");
    });

    // Check localStorage
    const savedUsers = JSON.parse(localStorage.getItem("crm_saved_users") || "[]");
    expect(savedUsers).toHaveLength(1);
    expect(savedUsers[0].email).toBe("jonas@example.com");
    expect(savedUsers[0].name).toBe("jonas");
  });
});
