"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TeamMemberDetail } from "@/features/teams/components/TeamMemberDetail";
import { useParams } from "next/navigation";

export default function TeamMemberPage() {
  const params = useParams<{ userId: string }>();
  return (
    <DashboardLayout>
      <TeamMemberDetail userId={params.userId} />
    </DashboardLayout>
  );
}
