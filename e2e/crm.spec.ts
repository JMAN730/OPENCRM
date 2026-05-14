import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { encode } from "next-auth/jwt";

const BASE_URL = "http://127.0.0.1:3100";
const COOKIE_NAME = "next-auth.session-token";
const NEXTAUTH_SECRET = readEnvValue("NEXTAUTH_SECRET");

type SessionUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: "ADMIN" | "USER";
  teamId: string | null;
};

type MockLead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  status: string;
  source: string | null;
  callOutcome: string | null;
  callNotes: string | null;
  createdAt: string;
  assignedToId: string | null;
  assignedTo: { id: string; name: string | null; email: string | null; image: string | null } | null;
};

type MockTask = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  lead: null;
  user: { name: string; image: string | null };
};

type MockMember = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "ADMIN" | "USER";
  teamId: string | null;
  team: { id: string; name: string } | null;
};

type MockTeam = {
  id: string;
  name: string;
  leaderId: string | null;
  leader: null;
  users: Array<{
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    role: "ADMIN" | "USER";
  }>;
};

type MockState = {
  leads: MockLead[];
  tasks: MockTask[];
  members: MockMember[];
  teams: MockTeam[];
};

function readEnvValue(name: string) {
  const source = readFileSync(".env", "utf8");
  const line = source
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) {
    throw new Error(`Missing ${name} in .env`);
  }

  const raw = line.slice(name.length + 1).trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  return raw;
}

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function trpcEnvelope(data: unknown) {
  return {
    result: {
      data,
    },
  };
}

function parseTrpcInputs(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const raw = request.postData() ?? url.searchParams.get("input");
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [parsed];
  }

  return Object.keys(parsed)
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => {
      const value = (parsed as Record<string, unknown>)[key];
      if (value && typeof value === "object" && "json" in (value as Record<string, unknown>)) {
        return (value as { json: unknown }).json;
      }
      return value;
    });
}

function buildSession(user: SessionUser) {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: null,
      role: user.role,
      organizationId: user.organizationId,
      teamId: user.teamId,
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

async function seedAuthenticatedSession(context: BrowserContext, user: SessionUser) {
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      teamId: user.teamId,
    },
    secret: NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60,
  });

  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function mockAuthenticatedApis(page: Page, user: SessionUser, state: MockState) {
  await page.route("**/api/auth/session**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSession(user)),
    });
  });

  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = url.pathname.slice("/api/trpc/".length).split(",");
    const inputs = parseTrpcInputs(route);
    const responses = procedures.map((procedure, index) =>
      trpcEnvelope(handleProcedure(procedure, inputs[index], state, user)),
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses),
    });
  });
}

function handleProcedure(procedure: string, input: unknown, state: MockState, user: SessionUser) {
  switch (procedure) {
    case "dashboard.sidebarCounts":
      return {
        leads: state.leads.length,
        tasks: state.tasks.filter((task) => !task.completed).length,
        scraperActive: 0,
      };

    case "leads.getAll":
      return {
        items: clone(state.leads),
        nextCursor: null,
      };

    case "leads.create": {
      const payload = (input ?? {}) as Record<string, string | undefined>;
      const lead: MockLead = {
        id: `lead-${uniqueId()}`,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        company: payload.company ?? null,
        website: null,
        status: "NOT_CONTACTED",
        source: payload.source ?? "Manual",
        callOutcome: "NOT_CONTACTED",
        callNotes: null,
        createdAt: new Date().toISOString(),
        assignedToId: user.id,
        assignedTo: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: null,
        },
      };
      state.leads.unshift(lead);
      return clone(lead);
    }

    case "leads.delete": {
      const payload = input as { id: string };
      state.leads = state.leads.filter((lead) => lead.id !== payload.id);
      return { success: true };
    }

    case "tasks.getAll":
      return {
        items: clone(state.tasks),
        nextCursor: null,
      };

    case "tasks.create": {
      const payload = (input ?? {}) as { title: string; dueDate?: string };
      const task: MockTask = {
        id: `task-${uniqueId()}`,
        title: payload.title,
        dueDate: payload.dueDate,
        completed: false,
        lead: null,
        user: { name: user.name, image: null },
      };
      state.tasks.unshift(task);
      return clone(task);
    }

    case "tasks.update": {
      const payload = input as { taskId: string; completed?: boolean };
      const task = state.tasks.find((item) => item.id === payload.taskId);
      if (!task) throw new Error(`Unknown task ${payload.taskId}`);
      if (typeof payload.completed === "boolean") {
        task.completed = payload.completed;
      }
      return clone(task);
    }

    case "teams.myTeam":
      return null;

    case "teams.activityFeed":
      return [];

    case "teams.list":
      return clone(state.teams);

    case "teams.organizationMembers":
      return clone(state.members);

    case "teams.create": {
      const payload = (input ?? {}) as { name: string; leaderId?: string };
      const team: MockTeam = {
        id: `team-${uniqueId()}`,
        name: payload.name,
        leaderId: payload.leaderId ?? null,
        leader: null,
        users: [],
      };
      state.teams.push(team);
      return clone(team);
    }

    case "teams.inviteUser": {
      const payload = input as { name: string; email: string; role: "ADMIN" | "USER" };
      const member: MockMember = {
        id: `user-${uniqueId()}`,
        name: payload.name,
        email: payload.email,
        image: null,
        role: payload.role,
        teamId: null,
        team: null,
      };
      state.members.push(member);
      return {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
      };
    }

    case "teams.setMembership": {
      const payload = input as { userId: string; teamId: string | null };
      const member = state.members.find((item) => item.id === payload.userId);
      if (!member) throw new Error(`Unknown member ${payload.userId}`);

      for (const team of state.teams) {
        team.users = team.users.filter((item) => item.id !== member.id);
      }

      if (payload.teamId) {
        const team = state.teams.find((item) => item.id === payload.teamId);
        if (!team) throw new Error(`Unknown team ${payload.teamId}`);
        member.teamId = team.id;
        member.team = { id: team.id, name: team.name };
        team.users.push({
          id: member.id,
          name: member.name,
          email: member.email,
          image: member.image,
          role: member.role,
        });
      } else {
        member.teamId = null;
        member.team = null;
      }

      return {
        id: member.id,
        teamId: member.teamId,
      };
    }

    default:
      throw new Error(`Unhandled tRPC procedure: ${procedure}`);
  }
}

test("redirects anonymous users to sign in for protected routes", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=%2Fdashboard/);
});

test("covers authenticated leads, tasks, and team admin flows in the browser", async ({
  context,
  page,
}) => {
  const user: SessionUser = {
    id: "admin-1",
    email: "admin@example.com",
    name: "Admin User",
    organizationId: "org-1",
    role: "ADMIN",
    teamId: null,
  };
  const state: MockState = {
    leads: [],
    tasks: [],
    members: [
      {
        id: user.id,
        name: user.name,
        email: user.email,
        image: null,
        role: user.role,
        teamId: null,
        team: null,
      },
    ],
    teams: [],
  };

  await seedAuthenticatedSession(context, user);
  await mockAuthenticatedApis(page, user, state);

  const runId = uniqueId();
  const teamName = `Velocity Team ${runId}`;
  const leadCompany = `Signal Labs ${runId}`;
  const taskTitle = `Follow up ${runId}`;
  const memberName = `Member ${runId}`;
  const memberEmail = `member-${runId}@example.com`;

  await page.goto("/leads");
  const leadsMain = page.getByRole("main");
  await expect(leadsMain.getByRole("heading", { name: "Leads" })).toBeVisible();
  await leadsMain.getByRole("button", { name: /^new lead$/i }).click();
  const leadForm = page.locator("form").filter({ has: page.locator('input[name="company"]') }).first();
  await leadForm.locator('input[name="company"]').fill(leadCompany);
  await leadForm.locator('input[name="email"]').fill(`lead-${runId}@example.com`);
  await leadForm.getByRole("button", { name: /create lead/i }).click();

  const searchInput = leadsMain.getByPlaceholder(/search leads/i);
  await searchInput.fill(leadCompany);
  const leadRow = leadsMain.locator("tr").filter({ hasText: leadCompany });
  await expect(leadRow).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await leadRow.getByTitle("Delete").click();
  await expect(leadRow).toHaveCount(0);

  await page.goto("/tasks");
  const tasksMain = page.getByRole("main");
  await expect(tasksMain.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await tasksMain.getByRole("button", { name: /new task/i }).click();
  await tasksMain.getByPlaceholder(/task title/i).fill(taskTitle);
  await tasksMain.getByRole("button", { name: /^add$/i }).click();
  const taskCard = tasksMain.locator(".crm-task").filter({ hasText: taskTitle }).first();
  await expect(taskCard).toBeVisible();
  await taskCard.click();
  const completedTasks = tasksMain.locator(".crm-card.flush").filter({ hasText: "Completed" });
  await expect(completedTasks.getByText(taskTitle)).toBeVisible();

  await page.goto("/team");
  const teamMain = page.getByRole("main");
  await expect(teamMain.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  const adminTeamsPanel = teamMain.locator(".crm-card.flush").filter({ hasText: "Teams (admin)" }).first();
  await adminTeamsPanel.getByRole("button", { name: /new team/i }).click();
  await adminTeamsPanel.getByPlaceholder("Team name").fill(teamName);
  await adminTeamsPanel.getByRole("button", { name: /^create$/i }).click();
  await expect(adminTeamsPanel.getByText(teamName, { exact: true })).toBeVisible();

  await adminTeamsPanel.getByRole("button", { name: /create user account/i }).click();
  await adminTeamsPanel.getByPlaceholder("Full name").fill(memberName);
  await adminTeamsPanel.getByPlaceholder("Email address").fill(memberEmail);
  await adminTeamsPanel.getByPlaceholder(/password \(min 8 chars\)/i).fill("Password123!");
  await adminTeamsPanel.getByRole("button", { name: /add user/i }).click();

  await adminTeamsPanel.getByRole("button", { name: /add member/i }).click();
  await page.getByPlaceholder(/search by name or email/i).fill(memberEmail);
  const memberRow = page.locator("label").filter({ hasText: memberEmail }).first();
  await memberRow.click();
  await page.getByRole("button", { name: /add 1 selected/i }).click();
  await expect(adminTeamsPanel.getByText(memberName).last()).toBeVisible();
});
