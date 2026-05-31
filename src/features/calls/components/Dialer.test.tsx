import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Dialer } from "./Dialer";

// --- Mocks ---

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    info: (...args: unknown[]) => toastInfo(...args),
  },
}));

const mockDisconnect = vi.fn();
const mockMute = vi.fn();
const mockSendDigits = vi.fn();
const mockDeviceHandlers: Record<string, (arg?: unknown) => void> = {};
const mockRegister = vi.fn().mockImplementation(async () => {
  // Mirror the real SDK: registration completes by emitting "registered".
  mockDeviceHandlers.registered?.();
});
const mockDestroy = vi.fn();
const mockConnect = vi.fn();

vi.mock("@twilio/voice-sdk", () => {
  const Device = vi.fn().mockImplementation(() => ({
    on: (event: string, cb: (arg?: unknown) => void) => {
      mockDeviceHandlers[event] = cb;
    },
    register: mockRegister,
    destroy: mockDestroy,
    connect: mockConnect,
  }));
  return { Device };
});

const mockLogCall = vi.fn();
const mockGenerateToken = vi.fn();
const mockGetRecent = vi.fn();

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    calls: {
      generateToken: {
        useQuery: () => mockGenerateToken(),
      },
      logCall: {
        useMutation: () => ({ mutate: mockLogCall }),
      },
      getRecent: {
        useQuery: () => mockGetRecent(),
      },
    },
    // ScriptsPanel (read-only) is rendered inside the Dialer
    scripts: {
      getAll: { useQuery: () => ({ data: [], isLoading: false }) },
      replaceAll: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    useUtils: () => ({ scripts: { getAll: { invalidate: vi.fn() } } }),
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

// --- Tests ---

describe("Dialer", () => {
  beforeEach(() => {
    toastError.mockClear();
    toastSuccess.mockClear();
    toastInfo.mockClear();
    mockLogCall.mockClear();
    mockConnect.mockClear();
    mockDisconnect.mockClear();
    mockMute.mockClear();
    mockRegister.mockClear();
    for (const key of Object.keys(mockDeviceHandlers)) delete mockDeviceHandlers[key];

    // jsdom defaults window.isSecureContext to false, which the Dialer treats as
    // an insecure context — hiding the dialer behind an HTTPS banner and skipping
    // device init. Simulate a normal HTTPS browser so the dialer initializes.
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    // Default: Twilio not configured (no token)
    mockGenerateToken.mockReturnValue({ data: undefined, error: undefined });
    mockGetRecent.mockReturnValue({ data: [], refetch: vi.fn() });
  });

  it("appends keypad digits to the phone number", () => {
    render(<Dialer />);
    const input = screen.getByPlaceholderText("000-000-0000") as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(input.value).toBe("123");
  });

  it("does not allow more than 15 digits in the phone number", () => {
    render(<Dialer />);
    const input = screen.getByPlaceholderText("000-000-0000") as HTMLInputElement;

    for (let i = 0; i < 20; i++) {
      fireEvent.click(screen.getByRole("button", { name: "5" }));
    }

    expect(input.value).toHaveLength(15);
  });

  it("shows an error toast when starting a call with no number", async () => {
    // A ready device requires a token (and the secure context set in beforeEach).
    mockGenerateToken.mockReturnValue({ data: { token: "tok" }, error: undefined });
    render(<Dialer />);

    // The call button is disabled until the Twilio device registers.
    const callButton = document.querySelector(".bg-green-500") as HTMLButtonElement;
    await waitFor(() => expect(callButton).not.toBeDisabled());
    fireEvent.click(callButton);

    expect(toastError).toHaveBeenCalledWith("Please enter a phone number");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("disables the call button when the device is not ready (no token)", () => {
    // No token (beforeEach default) → the Twilio device never registers, so the
    // dialer guards against calling by disabling the button rather than toasting.
    render(<Dialer />);
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    const callButton = document.querySelector(".bg-green-500") as HTMLButtonElement;
    expect(callButton).toBeDisabled();
  });

  it("shows Twilio not configured notice when token query returns PRECONDITION_FAILED", () => {
    mockGenerateToken.mockReturnValue({
      data: undefined,
      error: { data: { code: "PRECONDITION_FAILED" } },
    });

    render(<Dialer />);

    expect(screen.getByText("Twilio not configured")).toBeInTheDocument();
  });

  it("shows the Twilio error code when device registration fails", async () => {
    mockGenerateToken.mockReturnValue({ data: { token: "tok" }, error: undefined });
    render(<Dialer />);

    await waitFor(() => expect(mockDeviceHandlers.error).toBeDefined());
    act(() => {
      mockDeviceHandlers.error({ message: "Access token signature validation failed", code: 31202 });
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Dialer error: Access token signature validation failed (31202)",
      );
    });
  });

  it("renders call history when recent calls are available", () => {
    mockGetRecent.mockReturnValue({
      data: [
        {
          id: "c1",
          status: "CONNECTED",
          duration: 90,
          createdAt: new Date().toISOString(),
          lead: { firstName: "Jane", lastName: "Doe" },
        },
      ],
      refetch: vi.fn(),
    });

    render(<Dialer />);

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("CONNECTED")).toBeInTheDocument();
  });

  it("pre-populates the phone number from initialPhone prop", () => {
    render(<Dialer initialPhone="+15551234567" />);
    const input = screen.getByPlaceholderText("000-000-0000") as HTMLInputElement;
    expect(input.value).toBe("+15551234567");
  });
});
