import { SmsDraftStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<SmsDraftStatus, string> = {
  DRAFT: "Draft",
  SENDING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed — call instead",
};

const VARIANTS: Record<SmsDraftStatus, "default" | "outline" | "secondary" | "destructive"> = {
  DRAFT: "outline",
  SENDING: "secondary",
  SENT: "secondary",
  DELIVERED: "default",
  FAILED: "destructive",
};

export function SmsStatusBadge({ status }: { status: SmsDraftStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
