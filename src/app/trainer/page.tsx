"use client";

import { Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TrainerPanel } from "@/features/trainer/components/TrainerPanel";

export default function TrainerPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={null}>
        <TrainerPanel />
      </Suspense>
    </DashboardLayout>
  );
}
