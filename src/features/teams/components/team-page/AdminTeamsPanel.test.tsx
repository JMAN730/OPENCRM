import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminTeamsPanel } from "./AdminTeamsPanel";

const createTeamMutate = vi.fn();
const updateTeamMutate = vi.fn();
const deleteTeamMutate = vi.fn();
const setMembershipMutate = vi.fn();
const promoteRoleMutate = vi.fn();
const inviteByEmailMutate = vi.fn();
const invalidate = vi.fn();

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      teams: {
        list: { invalidate },
        myTeam: { invalidate },
        organizationMembers: { invalidate },
      },
    }),
    teams: {
      create: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => ({
          mutate: (args: unknown) => { createTeamMutate(args); onSuccess(); },
          isPending: false,
        }),
      },
      update: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => ({
          mutate: (args: unknown) => { updateTeamMutate(args); onSuccess(); },
          isPending: false,
        }),
      },
      delete: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => ({
          mutate: (args: unknown) => { deleteTeamMutate(args); onSuccess(); },
          isPending: false,
        }),
      },
      setMembership: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => ({
          mutate: (args: unknown) => { setMembershipMutate(args); onSuccess(); },
          isPending: false,
        }),
      },
      promoteRole: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => ({
          mutate: (args: unknown) => { promoteRoleMutate(args); onSuccess(); },
          isPending: false,
        }),
      },
      inviteByEmail: {
        useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => ({
          mutate: (args: unknown) => { inviteByEmailMutate(args); onSuccess(); },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// AddMemberModal is rendered conditionally; stub it out
vi.mock("./AddMemberModal", () => ({
  AddMemberModal: ({ open, teamName }: { open: boolean; teamName: string }) =>
    open ? <div>AddMemberModal for {teamName}</div> : null,
}));

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Alice",
    email: "alice@example.com",
    role: "ADMIN" as const,
    teamId: null,
    team: null,
    image: null,
    ...overrides,
  };
}

function makeTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "team-1",
    name: "Sales",
    organizationId: "org-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    leaderId: null,
    users: [],
    leader: null,
    ...overrides,
  };
}

const defaultProps = {
  callerId: "user-1",
  members: [makeMember()],
  membersLoading: false,
  teams: [makeTeam()],
};

describe("AdminTeamsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("renders the team list with team names", () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("shows 'No teams yet' when there are no teams", () => {
    render(<AdminTeamsPanel {...defaultProps} teams={[]} />);
    expect(screen.getByText(/No teams yet/i)).toBeInTheDocument();
  });

  it("shows the New team form when 'New team' is clicked", () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /New team/i }));
    expect(screen.getByPlaceholderText("Team name")).toBeInTheDocument();
  });

  it("creates a team when the form is filled and Create is clicked", async () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /New team/i }));
    fireEvent.change(screen.getByPlaceholderText("Team name"), {
      target: { value: "Engineering" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));

    await waitFor(() => {
      expect(createTeamMutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Engineering" }),
      );
    });
  });

  it("Create button is disabled while team name is empty", () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /New team/i }));
    expect(screen.getByRole("button", { name: /^Create$/ })).toBeDisabled();
  });

  it("hides the New team form when Cancel is clicked", async () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /New team/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Team name")).not.toBeInTheDocument();
    });
  });

  it("shows the Invite user form when 'Invite user' is clicked", () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Invite user/i }));
    expect(screen.getByPlaceholderText("Email address")).toBeInTheDocument();
  });

  it("Send invite button is disabled when email is empty", () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Invite user/i }));
    expect(screen.getByRole("button", { name: /Send invite/i })).toBeDisabled();
  });

  it("calls inviteByEmail with email and selected role", async () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Invite user/i }));

    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "newuser@example.com" },
    });
    fireEvent.change(screen.getByDisplayValue("User"), { target: { value: "MANAGER" } });
    fireEvent.click(screen.getByRole("button", { name: /Send invite/i }));

    await waitFor(() => {
      expect(inviteByEmailMutate).toHaveBeenCalledWith(
        expect.objectContaining({ email: "newuser@example.com", role: "MANAGER" }),
      );
    });
  });

  it("renders team members with remove and role-change controls", () => {
    const team = makeTeam({
      users: [{ id: "user-2", name: "Bob", email: "bob@example.com", role: "USER" }],
    });
    render(<AdminTeamsPanel {...defaultProps} teams={[team]} />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByDisplayValue("User")).toBeInTheDocument();
  });

  it("calls setMembership with null teamId when remove member button is clicked", async () => {
    const team = makeTeam({
      users: [{ id: "user-2", name: "Bob", email: "bob@example.com", role: "USER" }],
    });
    render(<AdminTeamsPanel {...defaultProps} teams={[team]} />);

    // The remove button has title "Remove from team"
    fireEvent.click(screen.getByTitle("Remove from team"));

    await waitFor(() => {
      expect(setMembershipMutate).toHaveBeenCalledWith({ userId: "user-2", teamId: null });
    });
  });

  it("calls promoteRole when a member's role select changes", async () => {
    const team = makeTeam({
      users: [{ id: "user-2", name: "Bob", email: "bob@example.com", role: "USER" }],
    });
    render(<AdminTeamsPanel {...defaultProps} teams={[team]} />);

    fireEvent.change(screen.getByDisplayValue("User"), { target: { value: "MANAGER" } });

    await waitFor(() => {
      expect(promoteRoleMutate).toHaveBeenCalledWith({ userId: "user-2", role: "MANAGER" });
    });
  });

  it("calls deleteTeam when delete is clicked and confirmed", async () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Delete team"));

    await waitFor(() => {
      expect(deleteTeamMutate).toHaveBeenCalledWith({ id: "team-1" });
    });
  });

  it("does not delete team when confirm is dismissed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Delete team"));
    expect(deleteTeamMutate).not.toHaveBeenCalled();
  });

  it("opens AddMemberModal when 'Add member' pill is clicked", async () => {
    render(<AdminTeamsPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Add member/i }));
    await waitFor(() => {
      expect(screen.getByText("AddMemberModal for Sales")).toBeInTheDocument();
    });
  });
});
