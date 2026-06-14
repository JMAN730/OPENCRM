import { EmailDraftStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<EmailDraftStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  OPENED: "Opened",
  CLICKED: "Clicked",
  BOUNCED: "Bounced",
  COMPLAINED: "Complained",
  UNSUBSCRIBED: "Unsubscribed",
};

const VARIANTS: Record<EmailDraftStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  SENT: "secondary",
  OPENED: "default",
  CLICKED: "default",
  BOUNCED: "destructive",
  COMPLAINED: "destructive",
  UNSUBSCRIBED: "destructive",
};

export function EmailStatusBadge({ status }: { status: EmailDraftStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
