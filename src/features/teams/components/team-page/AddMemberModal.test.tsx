import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddMemberModal } from "./AddMemberModal";

const setMembershipMutate = vi.fn();
const invalidateList = vi.fn();
const invalidateMembers = vi.fn();
const invalidateMyTeam = vi.fn();

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      teams: {
        list: { invalidate: invalidateList },
        organizationMembers: { invalidate: invalidateMembers },
        myTeam: { invalidate: invalidateMyTeam },
      },
    }),
    teams: {
      setMembership: {
        useMutation: ({
          onSuccess,
          onError,
        }: {
          onSuccess: () => void;
          onError: (e: Error) => void;
        }) => ({
          mutateAsync: async (args: unknown) => {
            setMembershipMutate(args);
            onSuccess();
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-2",
    name: "Bob Smith",
    email: "bob@example.com",
    role: "USER" as const,
    teamId: null,
    team: null,
    image: null,
    ...overrides,
  };
}

const defaultProps = {
  callerId: "user-1",
  membersLoading: false,
  onClose: vi.fn(),
  open: true,
  orgMembers: [makeMember()],
  teamId: "team-1",
  teamName: "Sales",
};

describe("AddMemberModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the modal title with the team name", () => {
    render(<AddMemberModal {...defaultProps} />);
    expect(screen.getByText("Add members to Sales")).toBeInTheDocument();
  });

  it("renders available members (excluding the caller)", () => {
    render(<AddMemberModal {...defaultProps} />);
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
  });

  it("excludes the caller from the member list", () => {
    const props = {
      ...defaultProps,
      callerId: "user-2",
      orgMembers: [makeMember({ id: "user-2", name: "Bob Smith" })],
    };
    render(<AddMemberModal {...props} />);
    expect(screen.queryByText("Bob Smith")).not.toBeInTheDocument();
  });

  it("excludes members already on the team", () => {
    const props = {
      ...defaultProps,
      orgMembers: [makeMember({ teamId: "team-1" })],
    };
    render(<AddMemberModal {...props} />);
    expect(screen.queryByText("Bob Smith")).not.toBeInTheDocument();
  });

  it("shows skeleton loaders while members are loading", () => {
    render(<AddMemberModal {...defaultProps} membersLoading />);
    expect(screen.queryByText("Bob Smith")).not.toBeInTheDocument();
  });

  it("shows an empty message when no addable users are available", () => {
    render(<AddMemberModal {...defaultProps} orgMembers={[]} />);
    expect(screen.getByText(/No users available to add/i)).toBeInTheDocument();
  });

  it("filters members by the search query", () => {
    const props = {
      ...defaultProps,
      orgMembers: [
        makeMember({ id: "user-2", name: "Bob Smith" }),
        makeMember({ id: "user-3", name: "Alice Jones" }),
      ],
    };
    render(<AddMemberModal {...props} />);

    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: "alice" } });

    expect(screen.getByText("Alice Jones")).toBeInTheDocument();
    expect(screen.queryByText("Bob Smith")).not.toBeInTheDocument();
  });

  it("shows 'no match' text when search returns no results", () => {
    render(<AddMemberModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: "zzz" } });
    expect(screen.getByText(/No users match your search/i)).toBeInTheDocument();
  });

  it("toggles member selection when a member row is clicked", async () => {
    render(<AddMemberModal {...defaultProps} />);
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
  });

  it("the Add button is disabled when no members are selected", () => {
    render(<AddMemberModal {...defaultProps} />);
    const addBtn = screen.getByRole("button", { name: /Add selected/i });
    expect(addBtn).toBeDisabled();
  });

  it("enables and labels the Add button with the count of selected members", async () => {
    render(<AddMemberModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => {
      const addBtn = screen.getByRole("button", { name: /Add 1 selected/i });
      expect(addBtn).not.toBeDisabled();
    });
  });

  it("calls setMembership and onClose when Add is clicked", async () => {
    render(<AddMemberModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => screen.getByRole("button", { name: /Add 1 selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add 1 selected/i }));

    await waitFor(() => {
      expect(setMembershipMutate).toHaveBeenCalledWith({ userId: "user-2", teamId: "team-1" });
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it("invalidates caches after successful add", async () => {
    render(<AddMemberModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => screen.getByRole("button", { name: /Add 1 selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add 1 selected/i }));

    await waitFor(() => {
      expect(invalidateList).toHaveBeenCalled();
      expect(invalidateMembers).toHaveBeenCalled();
      expect(invalidateMyTeam).toHaveBeenCalled();
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    render(<AddMemberModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("does not render the modal content when open is false", () => {
    render(<AddMemberModal {...defaultProps} open={false} />);
    expect(screen.queryByText("Add members to Sales")).not.toBeInTheDocument();
  });
});
