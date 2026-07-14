"use client";

import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import type { Lead } from "./shared";

type Props = {
  lead: Lead;
  onClose: () => void;
};

const INPUT_STYLE: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  border: "1px solid var(--crm-border)",
  borderRadius: "var(--crm-radius-sm)",
  background: "var(--crm-surface-2)",
  fontSize: 13,
  fontFamily: "var(--crm-font-sans)",
  color: "var(--crm-fg)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const LABEL_TEXT_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: "var(--crm-fg-muted)",
  fontWeight: 500,
};

export function EditLeadDialog({ lead, onClose }: Props) {
  useBodyScrollLock();
  const utils = trpc.useUtils();

  const update = trpc.leads.update.useMutation({
    onSuccess: () => {
      void utils.leads.getAll.invalidate();
      toast.success("Lead updated");
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update lead");
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) as string | null) ?? undefined;
    update.mutate({
      id: lead.id,
      firstName: get("firstName") || undefined,
      lastName: get("lastName") || undefined,
      company: get("company") || undefined,
      email: get("email") || undefined,
      phone: get("phone") || undefined,
      city: get("city") || undefined,
      state: get("state") || undefined,
      website: get("website") || undefined,
      source: get("source") || undefined,
      status: (get("status") as "NOT_CONTACTED" | "CONNECTED" | "AI_VOICEMAIL" | "NO_ANSWER" | "HUNG_UP") ?? "NOT_CONTACTED",
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--crm-overlay)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "grid",
        placeItems: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--crm-surface)",
          border: "1px solid var(--crm-border)",
          borderRadius: "var(--crm-radius-lg)",
          padding: 28,
          width: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--crm-shadow-pop)",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--crm-fg)" }}>
            Edit lead
          </h3>
          <button type="button" className="crm-btn ghost icon" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([["firstName", "First name"], ["lastName", "Last name"]] as const).map(([name, label]) => (
              <label key={name} style={LABEL_STYLE}>
                <span style={LABEL_TEXT_STYLE}>{label}</span>
                <input name={name} defaultValue={lead[name] ?? ""} style={INPUT_STYLE} />
              </label>
            ))}
          </div>

          <label style={LABEL_STYLE}>
            <span style={LABEL_TEXT_STYLE}>Company</span>
            <input name="company" defaultValue={lead.company ?? ""} style={INPUT_STYLE} />
          </label>

          <label style={LABEL_STYLE}>
            <span style={LABEL_TEXT_STYLE}>Work email</span>
            <input name="email" type="email" defaultValue={lead.email ?? ""} style={INPUT_STYLE} />
          </label>

          <label style={LABEL_STYLE}>
            <span style={LABEL_TEXT_STYLE}>Phone</span>
            <input name="phone" type="tel" defaultValue={lead.phone ?? ""} style={INPUT_STYLE} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 10 }}>
            <label style={LABEL_STYLE}>
              <span style={LABEL_TEXT_STYLE}>City</span>
              <input name="city" defaultValue={lead.city ?? ""} style={INPUT_STYLE} />
            </label>
            <label style={LABEL_STYLE}>
              <span style={LABEL_TEXT_STYLE}>State</span>
              <input name="state" maxLength={20} defaultValue={lead.state ?? ""} style={INPUT_STYLE} />
            </label>
          </div>

          <label style={LABEL_STYLE}>
            <span style={LABEL_TEXT_STYLE}>Website</span>
            <input name="website" type="url" defaultValue={lead.website ?? ""} placeholder="https://" style={INPUT_STYLE} />
          </label>

          <label style={LABEL_STYLE}>
            <span style={LABEL_TEXT_STYLE}>Source</span>
            <input name="source" defaultValue={lead.source ?? ""} style={INPUT_STYLE} />
          </label>

          <label style={LABEL_STYLE}>
            <span style={LABEL_TEXT_STYLE}>Status</span>
            <select
              name="status"
              defaultValue={lead.status ?? "NOT_CONTACTED"}
              style={{ ...INPUT_STYLE, appearance: "auto" }}
            >
              <option value="NOT_CONTACTED">Not contacted</option>
              <option value="CONNECTED">Connected</option>
              <option value="AI_VOICEMAIL">AI voicemail</option>
              <option value="NO_ANSWER">No answer</option>
              <option value="HUNG_UP">Hung up</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className="crm-btn ghost"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="crm-btn primary"
              style={{ flex: 1, justifyContent: "center" }}
              disabled={update.isPending}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
