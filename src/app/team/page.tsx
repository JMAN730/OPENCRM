"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TeamPage } from "@/features/teams/components/TeamPage";

export default function Team() {
  return (
    <DashboardLayout>
      <TeamPage />
    </DashboardLayout>
  );
}
