"use client";

import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { EmailStatusBadge } from "./EmailStatusBadge";
import { EmailDraftStatus } from "@prisma/client";
import { Loader2, Mail, Send, Trash2, Sparkles } from "lucide-react";

export function EmailDraftPanel({ leadId }: { leadId: string }) {
  const utils = trpc.useUtils();
  const { data: draft, isLoading } = trpc.emails.getDraftForLead.useQuery({ leadId });

  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const isDirty = subject !== null || body !== null;

  const generate = trpc.emails.generate.useMutation({
    onSuccess: () => {
      void utils.emails.getDraftForLead.invalidate({ leadId });
      toast.success("Email draft generated");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateDraft = trpc.emails.updateDraft.useMutation({
    onSuccess: () => {
      void utils.emails.getDraftForLead.invalidate({ leadId });
      setSubject(null);
      setBody(null);
      toast.success("Draft saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const send = trpc.emails.send.useMutation({
    onSuccess: () => {
      void utils.emails.getDraftForLead.invalidate({ leadId });
      toast.success("Email sent");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteDraft = trpc.emails.deleteDraft.useMutation({
    onSuccess: () => {
      void utils.emails.getDraftForLead.invalidate({ leadId });
      setSubject(null);
      setBody(null);
      toast.success("Draft deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--crm-fg-faint)", fontSize: 13 }}>
        <Loader2 size={13} className="animate-spin" />
        Loading…
      </div>
    );
  }

  if (!draft) {
    return (
      <button
        className="crm-btn"
        onClick={() => generate.mutate({ leadId })}
        disabled={generate.isPending}
      >
        {generate.isPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        Generate outreach email
      </button>
    );
  }

  const currentSubject = subject ?? draft.subject;
  const currentBody = body ?? draft.body;
  const hasOpened = draft.events.some((e) => e.event === "opened");
  const hasClicked = draft.events.some((e) => e.event === "clicked");
  const isEditable = draft.status === EmailDraftStatus.DRAFT;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Mail size={13} style={{ color: "var(--crm-fg-muted)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--crm-fg)" }}>Outreach Email</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <EmailStatusBadge status={draft.status} />
          {hasOpened && (
            <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Opened</span>
          )}
          {hasClicked && (
            <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>Clicked</span>
          )}
        </div>
      </div>

      {isEditable ? (
        <>
          <div>
            <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginBottom: 3 }}>Subject</div>
            <input
              className="crm-input"
              style={{ width: "100%", fontSize: 13 }}
              value={currentSubject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginBottom: 3 }}>Body</div>
            <textarea
              className="crm-input"
              style={{ width: "100%", fontSize: 12.5, minHeight: 180, resize: "vertical", lineHeight: 1.55 }}
              value={currentBody}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {isDirty && (
              <button
                className="crm-btn sm"
                disabled={updateDraft.isPending}
                onClick={() =>
                  updateDraft.mutate({ id: draft.id, subject: currentSubject, body: currentBody })
                }
              >
                {updateDraft.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
                Save
              </button>
            )}
            <button
              className="crm-btn primary sm"
              disabled={send.isPending || isDirty}
              title={isDirty ? "Save changes before sending" : undefined}
              onClick={() => {
                if (window.confirm("Send this email now?")) {
                  send.mutate({ id: draft.id });
                }
              }}
            >
              {send.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send
            </button>
            <button
              className="crm-btn ghost sm"
              onClick={() => generate.mutate({ leadId })}
              disabled={generate.isPending}
              title="Regenerate with AI"
            >
              <Sparkles size={12} />
            </button>
            <button
              className="crm-btn ghost sm"
              disabled={deleteDraft.isPending}
              onClick={() => {
                if (window.confirm("Delete this draft?")) {
                  deleteDraft.mutate({ id: draft.id });
                }
              }}
              style={{ marginLeft: "auto", color: "#dc2626" }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--crm-fg-muted)", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{draft.subject}</div>
          {draft.sentAt && (
            <div style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>
              Sent {new Date(draft.sentAt).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
