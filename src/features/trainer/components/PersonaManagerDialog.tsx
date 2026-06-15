"use client";

import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ELEVENLABS_VOICES } from "../voices";
import type { PersonaInput } from "../types";
import { Trash2, Pencil, Plus } from "lucide-react";

const EMPTY: PersonaInput = {
  name: "", description: "", systemPrompt: "", firstMessage: "Hello?",
  voiceId: ELEVENLABS_VOICES[0].id, voiceName: ELEVENLABS_VOICES[0].name,
};

const textareaClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function PersonaManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: personas = [] } = trpc.trainer.listPersonas.useQuery(undefined, { enabled: open });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaInput>(EMPTY);

  const resetForm = () => { setEditingId(null); setForm(EMPTY); };

  const create = trpc.trainer.createPersona.useMutation({
    onSuccess: () => { toast.success("Persona created"); void utils.trainer.listPersonas.invalidate(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.trainer.updatePersona.useMutation({
    onSuccess: () => { toast.success("Persona updated"); void utils.trainer.listPersonas.invalidate(); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.trainer.deletePersona.useMutation({
    onSuccess: () => { toast.success("Persona deleted"); void utils.trainer.listPersonas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (!form.name.trim() || !form.systemPrompt.trim() || !form.firstMessage.trim()) {
      toast.error("Name, first message, and system prompt are required.");
      return;
    }
    if (editingId) update.mutate({ id: editingId, ...form });
    else create.mutate(form);
  };

  const set = <K extends keyof PersonaInput>(k: K, v: PersonaInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Personas</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {personas.length === 0 && <p className="text-sm text-muted-foreground">No personas yet. Create one below.</p>}
          {personas.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.description} · {p.voiceName}</div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => { setEditingId(p.id); setForm({ name: p.name, description: p.description, systemPrompt: p.systemPrompt, firstMessage: p.firstMessage, voiceId: p.voiceId, voiceName: p.voiceName }); }}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => remove.mutate({ id: p.id })}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-border pt-3">
          <div className="text-sm font-medium">{editingId ? "Edit persona" : "New persona"}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Skeptical Owner" />
            </div>
            <div className="space-y-1">
              <Label>Voice</Label>
              <select
                className={textareaClass + " h-8"}
                value={form.voiceId}
                onChange={(e) => {
                  const v = ELEVENLABS_VOICES.find((x) => x.id === e.target.value)!;
                  setForm((f) => ({ ...f, voiceId: v.id, voiceName: v.name }));
                }}
              >
                {ELEVENLABS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Defensive, busy, distrusts cold callers" />
          </div>
          <div className="space-y-1">
            <Label>First message</Label>
            <Input value={form.firstMessage} onChange={(e) => set("firstMessage", e.target.value)} placeholder="Hello?" />
          </div>
          <div className="space-y-1">
            <Label>System prompt</Label>
            <textarea
              className={textareaClass}
              rows={5}
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              placeholder="You are {{leadName}}, owner of {{company}} in {{industry}}. You are busy and skeptical..."
            />
            <p className="text-xs text-muted-foreground">
              Placeholders: <code>{"{{leadName}}"}</code>, <code>{"{{company}}"}</code>, <code>{"{{industry}}"}</code> (industry = the lead&apos;s source).
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {editingId ? "Save changes" : <><Plus size={14} /> Create persona</>}
            </Button>
            {editingId && <Button variant="outline" onClick={resetForm}>Cancel</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
