import { SmsDraftStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<SmsDraftStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed — call instead",
};

export function SmsStatusBadge({ status }: { status: SmsDraftStatus }) {
  return (
    <Badge
      variant={
        status === SmsDraftStatus.FAILED
          ? "destructive"
          : status === SmsDraftStatus.DELIVERED
            ? "default"
            : status === SmsDraftStatus.DRAFT
              ? "outline"
              : "secondary"
      }
    >
      {LABELS[status]}
    </Badge>
  );
}
