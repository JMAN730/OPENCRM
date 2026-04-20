"use client";

import { trpc } from "@/app/_trpc/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Users, CheckCircle2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const { data: stats, isLoading } = trpc.dashboard.getKpiStats.useQuery();

  const kpiCards = [
    { 
      label: "Total Leads", 
      value: stats?.totalLeads ?? 0, 
      icon: Users, 
      color: "text-blue-500", 
      bg: "bg-blue-500/10" 
    },
    { 
      label: "Calls Today", 
      value: stats?.callsToday ?? 0, 
      icon: Phone, 
      color: "text-green-500", 
      bg: "bg-green-500/10" 
    },
    { 
      label: "Conversions", 
      value: stats?.conversionRate ?? "0.0%", 
      icon: TrendingUp, 
      color: "text-purple-500", 
      bg: "bg-purple-500/10" 
    },
    { 
      label: "Tasks Due", 
      value: stats?.followupsDue ?? 0, 
      icon: CheckCircle2, 
      color: "text-amber-500", 
      bg: "bg-amber-500/10" 
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
          <Card className="lg:col-span-4 border-none shadow-sm">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <Phone size={32} className="text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">No recent calls found.</p>
                <Link href="/dialer" className="text-sm text-primary hover:underline underline-offset-4">
                  Open the dialer
                </Link>
              </div>
            </CardContent>
          </Card>

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
