"use client";

import { trpc } from "@/app/_trpc/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Users, CheckCircle2, TrendingUp, DollarSign, PhoneMissed, PhoneOff } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_CONFIG = {
  CONNECTED:  { label: "Connected",  color: "text-green-500",  bg: "bg-green-500/10",  Icon: Phone },
  NO_ANSWER:  { label: "No Answer",  color: "text-amber-500",  bg: "bg-amber-500/10",  Icon: PhoneMissed },
  BUSY:       { label: "Busy",       color: "text-orange-500", bg: "bg-orange-500/10", Icon: PhoneOff },
  FAILED:     { label: "Failed",     color: "text-red-500",    bg: "bg-red-500/10",    Icon: PhoneOff },
  CANCELED:   { label: "Canceled",   color: "text-muted-foreground", bg: "bg-muted", Icon: PhoneOff },
} as const;

export default function DashboardPage() {
  const { data: stats, isLoading } = trpc.dashboard.getKpiStats.useQuery();

  const monthlyRevenueDisplay = stats?.monthlyRevenue != null
    ? `$${stats.monthlyRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "$0";

  const kpiCards = [
    {
      label: "Monthly Revenue",
      value: monthlyRevenueDisplay,
      icon: DollarSign,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Total Leads",
      value: stats?.totalLeads ?? 0,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Conversions",
      value: stats?.conversionRate ?? "0.0%",
      icon: TrendingUp,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      label: "Tasks Due",
      value: stats?.followupsDue ?? 0,
      icon: CheckCircle2,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Here&apos;s what&apos;s happening today.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {kpiCards.map((stat) => (
            <Card key={stat.label} className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`${stat.bg} ${stat.color} p-2 rounded-lg`}>
                  <stat.icon size={18} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
          {/* Recent Activity */}
          <Card className="lg:col-span-4 border-none shadow-sm">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-0 px-6 pb-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 border-b last:border-0">
                      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : stats?.recentCalls && stats.recentCalls.length > 0 ? (
                <div className="divide-y">
                  {stats.recentCalls.map((call) => {
                    const cfg = STATUS_CONFIG[call.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.FAILED;
                    return (
                      <div key={call.id} className="flex items-center gap-3 px-6 py-3">
                        <div className={`${cfg.bg} ${cfg.color} p-2 rounded-lg shrink-0`}>
                          <cfg.Icon size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium tracking-wide">{call.phone}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className={cfg.color}>{cfg.label}</span>
                            {call.duration ? ` · ${formatDuration(call.duration)}` : ""}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3 px-6">
                  <Phone size={32} className="text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No recent calls found.</p>
                  <Link href="/dialer" className="text-sm text-primary hover:underline underline-offset-4">
                    Open the dialer
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Tasks */}
          <Card className="lg:col-span-3 border-none shadow-sm">
            <CardHeader>
              <CardTitle>Upcoming Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : stats?.followupsDue && stats.followupsDue > 0 ? (
                <div className="flex flex-col gap-4">
                  <p className="text-sm font-medium">You have {stats.followupsDue} tasks due today.</p>
                  <Link href="/tasks">
                    <Button variant="outline" className="w-full">View Tasks</Button>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <CheckCircle2 size={32} className="text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No tasks due today.</p>
                  <Link href="/tasks" className="text-sm text-primary hover:underline underline-offset-4">
                    Create a task
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
