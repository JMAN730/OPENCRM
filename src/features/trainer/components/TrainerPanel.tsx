"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TrainerCall } from "./TrainerCall";
import { PersonaManagerDialog } from "./PersonaManagerDialog";
import { Settings2 } from "lucide-react";

const selectClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm h-9 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function leadLabel(l: { firstName: string | null; lastName: string | null; company: string | null }) {
  return l.company ?? [l.firstName, l.lastName].filter(Boolean).join(" ") ?? "Unnamed lead";
}

export function TrainerPanel() {
  const params = useSearchParams();
  const initialLeadId = params.get("leadId") ?? "";
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";

  const { data: leads = [] } = trpc.trainer.pickableLeads.useQuery();
  const { data: personas = [] } = trpc.trainer.listPersonas.useQuery();

  const [leadId, setLeadId] = useState(initialLeadId);
  const [personaId, setPersonaId] = useState("");
  const [started, setStarted] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const effectivePersonaId = personaId || personas[0]?.id || "";
  const canStart = useMemo(() => Boolean(leadId && effectivePersonaId), [leadId, effectivePersonaId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Call Trainer</h1>
          <p className="text-sm text-muted-foreground">Practice cold calls against an AI prospect.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setManageOpen(true)}>
            <Settings2 size={14} /> Manage Personas
          </Button>
        )}
      </div>

      {!started ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div className="space-y-1">
              <Label>Lead</Label>
              <select className={selectClass} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">Select a lead…</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{leadLabel(l)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Persona</Label>
              {personas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No personas yet.{isAdmin ? " Create one via Manage Personas." : " Ask an admin to create one."}
                </p>
              ) : (
                <select className={selectClass} value={effectivePersonaId} onChange={(e) => setPersonaId(e.target.value)}>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            <Button disabled={!canStart} onClick={() => setStarted(true)} className="bg-green-600 hover:bg-green-700">
              Start Practice Call
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-10 text-center">
            <p className="font-medium">Ready to practice</p>
            <p className="text-sm text-muted-foreground">Select a lead and persona, then start your session.</p>
          </div>
        </div>
      ) : (
        <TrainerCall
          leadId={leadId}
          personaId={effectivePersonaId}
          onReset={() => { setStarted(false); setPersonaId(""); }}
        />
      )}

      <PersonaManagerDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}
