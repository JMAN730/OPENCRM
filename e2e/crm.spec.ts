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
  city: string | null;
  state: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  status: string;
  temperatureOverride: "HOT" | "WARM" | "COOL" | null;
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
      loadingAnimationMode: "ALWAYS",
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
      loadingAnimationMode: "ALWAYS",
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
        city: payload.city ?? null,
        state: payload.state ?? null,
        website: null,
        rating: null,
        reviewCount: null,
        status: "NOT_CONTACTED",
        temperatureOverride: null,
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

    case "leads.getNotes":
      return [];

    case "leads.updateCallOutcome": {
      const payload = input as { id: string; callOutcome: string; callNotes?: string };
      const lead = state.leads.find((item) => item.id === payload.id);
      if (!lead) throw new Error(`Unknown lead ${payload.id}`);
      lead.callOutcome = payload.callOutcome;
      lead.callNotes = payload.callNotes ?? null;
      lead.status =
        payload.callOutcome === "ANSWERED"
          ? "CONNECTED"
          : payload.callOutcome;
      return clone(lead);
    }

    case "leads.updateTemperatureOverride": {
      const payload = input as { id: string; temperatureOverride: "HOT" | "WARM" | "COOL" | null };
      const lead = state.leads.find((item) => item.id === payload.id);
      if (!lead) throw new Error(`Unknown lead ${payload.id}`);
      lead.temperatureOverride = payload.temperatureOverride;
      return clone(lead);
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

    // ── Read-only handlers for sidebar-route smoke coverage ──────────────────
    // These return empty/default shapes so each page renders its shell without a
    // real backend. Mutations for these routes are out of scope for smoke tests.

    case "pipeline.getBoard":
      return { stages: [] };

    case "analytics.overview":
      return {
        kpis: {
          totalLeads: 0,
          leadsThisWeek: 0,
          callsThisWeek: 0,
          connectedCount: 0,
          contactRate: "0.0",
        },
        leadsPerDay: [],
        callsPerDay: [],
        touchDepth: { untouched: 0, one: 0, twoToFive: 0, sixPlus: 0 },
        bySource: [],
        byTemperature: [],
      };

    case "analytics.topCallers":
    case "analytics.repPerformance":
      return [];

    case "analytics.leadQuality":
      return { byNiche: [], byCity: [] };

    case "dashboard.getKpiStats":
      return { leadsByStatus: [] };

    case "dashboard.getTeamStats":
      return { memberStats: [] };

    case "scraper.config":
      return {
        enabled: true,
        categories: ["Mobile Mechanics", "Power washing", "Landscaping"],
        orgCategories: [],
        maxLocations: 50,
        maxLimit: 200,
        maxConcurrency: 4,
      };

    case "scraper.list":
    case "scraperSchedules.list":
      return [];

    case "outreach.stats":
      return { PENDING: 0, PROCESSING: 0, DONE: 0, SKIPPED: 0, FAILED: 0 };

    case "outreach.list":
      return { items: [], nextCursor: null };

    case "map.discoveryCategories":
      return { categories: [], enrichEnabled: false };

    case "map.missingCoordinatesCount":
      return { count: 0 };

    case "map.leadsInBounds":
      return [];

    case "billing.getSubscription":
      return {
        configured: false,
        planTier: "STARTER",
        planLabel: "Starter",
        status: "NONE",
        seatLimit: 3,
        seatsUsed: 1,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        hasStripeSubscription: false,
        limits: { maxTags: 25, maxScraperLocations: 50, maxScraperRecords: 200, seatLimit: 3 },
        availableTiers: [],
      };

    default:
      throw new Error(`Unhandled tRPC procedure: ${procedure}`);
  }
}

// ── Smoke-test helpers ────────────────────────────────────────────────────────
// A minimal admin session + empty mock state, reused by the sidebar-route smoke
// tests below. Each test asserts the route renders its shell and one critical
// interaction works — no real backend is involved.

function smokeAdminUser(): SessionUser {
  return {
    id: "admin-smoke",
    email: "admin@example.com",
    name: "Admin User",
    organizationId: "org-1",
    role: "ADMIN",
    teamId: null,
  };
}

async function seedSmokeSession(context: BrowserContext, page: Page) {
  const user = smokeAdminUser();
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
  return user;
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
    leads: [
      {
        id: "seed-lead-1",
        firstName: "Ava",
        lastName: "Lane",
        email: "ava@example.com",
        phone: "5551234567",
        company: "Signal Labs",
        city: "Tampa",
        state: "FL",
        website: "signallabs.example.com",
        rating: 4.6,
        reviewCount: 128,
        status: "NOT_CONTACTED",
        temperatureOverride: null,
        source: "GoogleMaps",
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
      },
    ],
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
  const seededLeadRow = leadsMain.locator("tr").filter({ hasText: "Signal Labs" });
  await seededLeadRow.click();
  await expect(page.getByText("4.6 ★ (128 reviews)").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "signallabs.example.com" })).toHaveAttribute(
    "href",
    "https://signallabs.example.com",
  );
  await page.getByTitle("Close (Esc)").click();
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

// ── Sidebar-route smoke coverage ──────────────────────────────────────────────
// Authenticated navigation + one critical interaction per route, backed by the
// mock tRPC handlers above. These guard against render regressions on routes not
// covered by the primary flow test.

test("smoke: pipeline board renders and switches to the forecast view", async ({ context, page }) => {
  await seedSmokeSession(context, page);

  await page.goto("/pipeline");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Pipeline" })).toBeVisible();

  // Client-only view switch — no backend round-trip.
  await main.getByRole("button", { name: "forecast" }).click();
  await expect(main.getByText("Weighted value")).toBeVisible();
});

test("smoke: analytics dashboard renders its KPI strip", async ({ context, page }) => {
  await seedSmokeSession(context, page);

  await page.goto("/analytics");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(main.getByText("Total leads")).toBeVisible();
  await expect(main.getByText("Contact rate")).toBeVisible();
});

test("smoke: scraper panel renders and accepts a location", async ({ context, page }) => {
  await seedSmokeSession(context, page);

  await page.goto("/scraper");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Scraper" })).toBeVisible();
  await expect(main.getByText("Start a new scrape")).toBeVisible();

  const locations = main.getByLabel("Locations");
  await locations.fill("Toledo, Ohio");
  await expect(locations).toHaveValue("Toledo, Ohio");
});

test("smoke: outreach queue renders its stat cards", async ({ context, page }) => {
  await seedSmokeSession(context, page);

  await page.goto("/outreach");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Outreach", exact: true })).toBeVisible();
  await expect(main.getByText("Outreach queue")).toBeVisible();
  await expect(main.getByText(/Nothing here yet/)).toBeVisible();

  // Client-only status filter — no backend round-trip; empty queue stays empty.
  await main.getByRole("button", { name: "Queued" }).click();
  await expect(main.getByText(/Nothing here yet/)).toBeVisible();
});

test("smoke: lead map renders the discovery panel", async ({ context, page }) => {
  await seedSmokeSession(context, page);

  await page.goto("/map");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Map", exact: true })).toBeVisible();
  // SelectionPanel only mounts once the client-only Leaflet bundle loads.
  await expect(main.getByRole("heading", { name: "Discover businesses" })).toBeVisible();
});

test("smoke: settings billing tab renders plan limits", async ({ context, page }) => {
  await seedSmokeSession(context, page);

  await page.goto("/settings");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Settings" })).toBeVisible();

  await main.getByRole("button", { name: "Billing" }).click();
  await expect(main.getByText("Plan limits")).toBeVisible();
  await expect(main.getByText(/team seats/)).toBeVisible();
});
