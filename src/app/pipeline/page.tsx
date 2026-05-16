'use client';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PipelineBoard } from '@/features/pipeline/components/PipelineBoard';

export default function PipelinePage() {
  return (
    <DashboardLayout>
      <PipelineBoard />
    </DashboardLayout>
  );
}
