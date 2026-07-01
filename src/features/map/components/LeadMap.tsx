"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Leaflet touches `window` at import time, so the whole map bundle is
// client-only. Nothing outside this boundary may import leaflet.
const LeadMapInner = dynamic(() => import("./LeadMapInner"), {
  ssr: false,
  loading: () => <Skeleton className="h-[70vh] w-full rounded-xl" />,
});

export function LeadMap() {
  return <LeadMapInner />;
}
