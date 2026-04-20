import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Users, Target } from "lucide-react";

const stats = [
  { label: "Conversion Rate", value: "—", icon: Target, color: "text-blue-500" },
  { label: "Total Revenue", value: "—", icon: TrendingUp, color: "text-green-500" },
  { label: "Active Leads", value: "0", icon: Users, color: "text-purple-500" },
  { label: "Avg. Call Duration", value: "—", icon: BarChart3, color: "text-amber-500" },
];

export default function AnalyticsPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Performance metrics for your sales team.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <stat.icon className={stat.color} size={18} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-none shadow-sm h-96 flex items-center justify-center">
          <CardContent className="text-center space-y-2">
            <BarChart3 size={48} className="mx-auto text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">No data yet</p>
            <p className="text-xs text-muted-foreground">Charts will populate as you add leads and log calls.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
