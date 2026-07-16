import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AnalyticsPage from "./page";

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    analytics: {
      overview: { useQuery: () => ({ data: undefined, isLoading: false }) },
      topCallers: {
        useQuery: () => ({
          data: [{
            userId: "user-1",
            name: "Maya Rivera",
            totalCalls: 10,
            connectedCalls: 4,
            connectionRate: 40,
            leadsAssigned: 20,
            conversions: 3,
            closeRate: 15,
            bookedAppointments: null,
          }],
        }),
      },
      repPerformance: {
        useQuery: () => ({
          data: [{
            userId: "user-1",
            name: "Maya Rivera",
            avgResponseHours: 1,
            followUpConsistency: 2,
            appointmentsBooked: null,
            pipelineValue: 2_500,
            conversions: 3,
          }],
        }),
      },
      leadQuality: {
        useQuery: () => ({
          data: {
            byNiche: [{ key: "Dental", total: 3, converted: 1, conversionRate: 33.3 }],
            byCity: [{ key: "Austin", total: 3, converted: 1, conversionRate: 33.3 }],
          },
        }),
      },
    },
    dashboard: {
      getTeamStats: { useQuery: () => ({ data: undefined }) },
      getKpiStats: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

describe("AnalyticsPage", () => {
  it("states that the dashboard mixes all-time totals with recent activity windows", () => {
    render(<AnalyticsPage />);

    expect(
      screen.getByText("All-time totals with 7- and 30-day activity trends"),
    ).toBeInTheDocument();
    expect(screen.getByText("· all-time calling and pipeline performance")).toBeInTheDocument();
    expect(screen.getByText("all time · in pipeline")).toBeInTheDocument();
    expect(screen.getByText("all time · 0 of 0 touched")).toBeInTheDocument();
    expect(screen.getByText("new leads · 7d")).toBeInTheDocument();
    expect(screen.getByText("logged · 7d")).toBeInTheDocument();
    expect(screen.getAllByText("last 30 days")).toHaveLength(2);
    expect(screen.getAllByText("all time · ≥3 leads")).toHaveLength(2);
    expect(screen.getByText("all-time leads")).toBeInTheDocument();
    expect(screen.getAllByText("all time")).toHaveLength(3);
  });
});
