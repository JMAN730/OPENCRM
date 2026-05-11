"use client";

import { trpc } from "@/app/_trpc/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Phone,
  Globe,
  Building2,
  User,
  Tag,
  Calendar,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getLeadStatusColor } from "@/features/leads/utils";

type Lead = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  website?: string | null;
  status: string;
  source?: string | null;
  callOutcome?: string | null;
  callNotes?: string | null;
  createdAt: string;
};

const CALL_OUTCOME_OPTIONS = [
  { value: "NOT_CONTACTED", label: "Not Contacted" },
  { value: "ANSWERED", label: "Connected" },
  { value: "HUNG_UP", label: "Hung Up" },
  { value: "NO_ANSWER", label: "No Answer" },
  { value: "AI_VOICEMAIL", label: "AI Voicemail" },
];

interface LeadDetailsModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
}

export function LeadDetailsModal({ lead, isOpen, onClose }: LeadDetailsModalProps) {
  const [callOutcome, setCallOutcome] = useState(lead.callOutcome || "NOT_CONTACTED");
  const [callNotes, setCallNotes] = useState(lead.callNotes || "");
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");

  const utils = trpc.useUtils();
  const updateOutcome = trpc.leads.updateCallOutcome.useMutation({
    onSuccess: () => {
      toast.success("Call outcome saved successfully");
      utils.leads.getAll.invalidate();
      onClose();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleSave = () => {
    updateOutcome.mutate({
      id: lead.id,
      callOutcome: callOutcome as any,
      callNotes: callNotes || undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead.company || fullName || "Lead Details"}</DialogTitle>
          <DialogDescription className="sr-only">Lead details and call outcome</DialogDescription>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className={getLeadStatusColor(lead.status)}>
              {lead.status}
            </Badge>
            {lead.source && (
              <span className="text-xs text-muted-foreground">{lead.source}</span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {fullName && (
            <div className="flex items-start gap-3">
              <User size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium">{fullName}</p>
              </div>
            </div>
          )}

          {lead.company && (
            <div className="flex items-start gap-3">
              <Building2 size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="text-sm font-medium">{lead.company}</p>
              </div>
            </div>
          )}

          {lead.email && (
            <div className="flex items-start gap-3">
              <Mail size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <a
                  href={`mailto:${lead.email}`}
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  {lead.email}
                </a>
              </div>
            </div>
          )}

          {lead.phone && (
            <div className="flex items-start gap-3">
              <Phone size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <a
                  href={`tel:${lead.phone}`}
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  {lead.phone}
                </a>
              </div>
            </div>
          )}

          {lead.website && (
            <div className="flex items-start gap-3">
              <Globe size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <a
                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline underline-offset-4 break-all"
                >
                  {lead.website}
                </a>
              </div>
            </div>
          )}

          {lead.source && (
            <div className="flex items-start gap-3">
              <Tag size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="text-sm font-medium">{lead.source}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <Calendar size={15} className="text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm font-medium">
                {new Date(lead.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="callOutcome">Call Outcome</Label>
            <select
              id="callOutcome"
              value={callOutcome}
              onChange={(e) => setCallOutcome(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {CALL_OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="callNotes">Notes (optional)</Label>
            <textarea
              id="callNotes"
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              placeholder="Add any notes about this call..."
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateOutcome.isPending}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={updateOutcome.isPending}>
            {updateOutcome.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
