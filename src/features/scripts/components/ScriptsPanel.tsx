"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { Plus, Trash2, Save, Undo2 } from "lucide-react";

type Script = {
  id?: string;
  category: string;
  title: string;
  body: string;
};

const INPUT_STYLE: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  border: "1px solid var(--crm-border)",
  borderRadius: "var(--crm-radius-sm)",
  background: "var(--crm-surface-2)",
  fontSize: 13,
  color: "var(--crm-fg)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  height: "auto",
  minHeight: 64,
  padding: "8px 10px",
  resize: "vertical",
  lineHeight: 1.5,
  fontFamily: "var(--crm-font-sans)",
};

function groupByCategory(scripts: Script[]): [string, Script[]][] {
  const groups = new Map<string, Script[]>();
  for (const s of scripts) {
    const arr = groups.get(s.category) ?? [];
    arr.push(s);
    groups.set(s.category, arr);
  }
  return [...groups.entries()];
}

export function ScriptsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role ?? "";
  const canEdit = !readOnly && (userRole === "ADMIN" || userRole === "MANAGER");

  const utils = trpc.useUtils();
  const { data: serverScripts = [], isLoading } = trpc.scripts.getAll.useQuery();
  const [draft, setDraft] = useState<Script[] | null>(null);

  const replaceAll = trpc.scripts.replaceAll.useMutation({
    onSuccess: () => {
      utils.scripts.getAll.invalidate();
      setDraft(null);
      toast.success("Scripts saved.");
    },
    onError: (err) => toast.error(err.message || "Failed to save scripts."),
  });

  const scripts: Script[] = draft ?? serverScripts;
  const isDirty = draft !== null;

  const update = (i: number, patch: Partial<Script>) =>
    setDraft(scripts.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const add = () => setDraft([...scripts, { category: "General", title: "", body: "" }]);
  const remove = (i: number) => setDraft(scripts.filter((_, idx) => idx !== i));

  const save = () => {
    const cleaned = scripts
      .map((s) => ({ category: s.category.trim(), title: s.title.trim(), body: s.body.trim() }))
      .filter((s) => s.category || s.title || s.body);
    if (cleaned.length === 0) {
      toast.error("Add at least one script before saving.");
      return;
    }
    if (cleaned.some((s) => !s.category || !s.title || !s.body)) {
      toast.error("Every script needs a category, title, and body.");
      return;
    }
    replaceAll.mutate({ scripts: cleaned.map((s, i) => ({ ...s, order: i })) });
  };

  if (isLoading) {
    return <div style={{ padding: 24, color: "var(--crm-fg-faint)", fontSize: 13 }}>Loading scripts…</div>;
  }

  // ----- READ MODE -----
  if (!canEdit) {
    const groups = groupByCategory(serverScripts);
    if (groups.length === 0) {
      return <div style={{ padding: 24, color: "var(--crm-fg-faint)", fontSize: 13 }}>No scripts available.</div>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.map(([category, items]) => (
          <details
            key={category}
            open
            style={{
              border: "1px solid var(--crm-border)",
              borderRadius: "var(--crm-radius)",
              background: "var(--crm-surface)",
              overflow: "hidden",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--crm-fg)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {category}
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--crm-fg-faint)" }}>{items.length}</span>
            </summary>
            <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((s) => (
                <div key={s.id ?? s.title} className="crm-card" style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: "var(--crm-fg)" }}>{s.title}</div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--crm-fg-muted)",
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {s.body}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    );
  }

  // ----- EDIT MODE (managers/admins) -----
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 12, color: "var(--crm-fg-faint)" }}>
          {scripts.length} script{scripts.length === 1 ? "" : "s"}
        </div>
        {isDirty && (
          <button
            className="crm-btn ghost"
            style={{ fontSize: 12, height: 30 }}
            onClick={() => setDraft(null)}
            disabled={replaceAll.isPending}
          >
            <Undo2 size={13} /> Discard
          </button>
        )}
        <button className="crm-btn ghost" style={{ fontSize: 12, height: 30 }} onClick={add}>
          <Plus size={13} /> Add script
        </button>
        <button
          className="crm-btn primary"
          style={{ fontSize: 12, height: 30 }}
          onClick={save}
          disabled={!isDirty || replaceAll.isPending}
        >
          <Save size={13} /> {replaceAll.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>

      {scripts.length === 0 ? (
        <div style={{ padding: 24, color: "var(--crm-fg-faint)", fontSize: 13, textAlign: "center" }}>
          No scripts yet. Click “Add script” to create one.
        </div>
      ) : (
        scripts.map((s, i) => (
          <div
            key={s.id ?? `new-${i}`}
            className="crm-card"
            style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 30px", gap: 10, alignItems: "center" }}>
              <input
                value={s.category}
                placeholder="Category"
                style={INPUT_STYLE}
                onChange={(e) => update(i, { category: e.target.value })}
              />
              <input
                value={s.title}
                placeholder="Title"
                style={INPUT_STYLE}
                onChange={(e) => update(i, { title: e.target.value })}
              />
              <button
                className="crm-btn ghost icon"
                style={{ width: 30, height: 30, padding: 0, color: "var(--crm-fg-faint)" }}
                onClick={() => remove(i)}
                title="Remove script"
                aria-label="Remove script"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <textarea
              value={s.body}
              placeholder="Script body…"
              style={TEXTAREA_STYLE}
              onChange={(e) => update(i, { body: e.target.value })}
            />
          </div>
        ))
      )}
    </div>
  );
}
