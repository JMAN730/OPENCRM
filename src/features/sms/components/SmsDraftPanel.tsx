"use client";

import { useState } from "react";
import { Loader2, MessageSquareText, Send, Sparkles } from "lucide-react";
import { SmsDraftStatus } from "@prisma/client";
import { toast } from "sonner";
import { trpc } from "@/app/_trpc/client";

interface SmsDraftPanelProps {
  leadId: string;
}

export function SmsDraftPanel({ leadId }: SmsDraftPanelProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.sms.getDraftForLead.useQuery({ leadId });
  const [body, setBody] = useState<string | null>(null);

  const refresh = () => utils.sms.getDraftForLead.invalidate({ leadId });
  const generate = trpc.sms.generate.useMutation({
    onSuccess: () => {
      void refresh();
      setBody(null);
      toast.success("SMS draft generated");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateDraft = trpc.sms.updateDraft.useMutation({
    onSuccess: () => {
      void refresh();
      setBody(null);
      toast.success("SMS draft saved");
    },
    onError: (error) => toast.error(error.message),
  });
  const send = trpc.sms.send.useMutation({
    onSuccess: () => {
      void refresh();
      toast.success("SMS sent");
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--crm-fg-faint)", fontSize: 13 }}>
        <Loader2 size={13} className="animate-spin" />
        Loading SMS…
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <MessageSquareText size={14} style={{ marginTop: 2, color: "var(--crm-fg-faint)" }} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--crm-fg-muted)" }}>
            Twilio SMS not configured
          </div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--crm-fg-faint)" }}>
            Add the Twilio Account SID, Auth Token, and Messaging Service SID to enable texting.
          </div>
        </div>
      </div>
    );
  }

  const draft = data.draft;
  if (!draft) {
    return (
      <button
        className="crm-btn"
        onClick={() => generate.mutate({ leadId })}
        disabled={generate.isPending}
      >
        {generate.isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Sparkles size={13} />
        )}
        Generate SMS draft
      </button>
    );
  }

  const currentBody = body ?? draft.body;
  const isDirty = body !== null;
  const isEditable = draft.status === SmsDraftStatus.DRAFT;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MessageSquareText size={13} style={{ color: "var(--crm-fg-muted)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--crm-fg)" }}>
            Outreach SMS
          </span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--crm-fg-muted)" }}>
          {draft.status}
        </span>
      </div>

      {isEditable ? (
        <>
          <label>
            <span style={{ display: "block", marginBottom: 3, fontSize: 11, color: "var(--crm-fg-faint)" }}>
              Message body
            </span>
            <textarea
              aria-label="Message body"
              className="crm-input"
              style={{ width: "100%", minHeight: 130, resize: "vertical", fontSize: 12.5, lineHeight: 1.55 }}
              value={currentBody}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ marginRight: "auto", fontSize: 11, color: "var(--crm-fg-faint)" }}>
              {currentBody.length} characters
            </span>
            {isDirty ? (
              <button
                className="crm-btn sm"
                disabled={updateDraft.isPending || !currentBody.trim()}
                onClick={() => updateDraft.mutate({ id: draft.id, body: currentBody })}
              >
                {updateDraft.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
                Save
              </button>
            ) : null}
            <button
              className="crm-btn primary sm"
              disabled={send.isPending || isDirty}
              title={isDirty ? "Save changes before sending" : undefined}
              onClick={() => {
                if (window.confirm("Send this SMS now?")) send.mutate({ id: draft.id });
              }}
            >
              {send.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send SMS
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--crm-fg-muted)", lineHeight: 1.5 }}>
          <div style={{ whiteSpace: "pre-wrap" }}>{draft.body}</div>
          {draft.sentAt ? (
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--crm-fg-faint)" }}>
              Sent {new Date(draft.sentAt).toLocaleDateString()}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
