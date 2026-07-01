"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { matchHint } from "../hints";
import type { Scorecard, TranscriptEntry } from "../types";
import { Mic, PhoneOff, Loader2, RotateCcw } from "lucide-react";

type Phase = "idle" | "connecting" | "active" | "scoring" | "done" | "error";
interface ActiveConversation { endSession: () => Promise<void>; }

function fmt(s: number) {
  const m = Math.floor(s / 60).toString();
  const r = (s % 60).toString().padStart(2, "0");
  return `${m}:${r}`;
}
function scoreColor(n: number) {
  return n >= 75 ? "text-green-600" : n >= 50 ? "text-amber-600" : "text-red-600";
}

export function TrainerCall({ leadId, personaId, onReset }: { leadId: string; personaId: string; onReset: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const convRef = useRef<ActiveConversation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSession = trpc.trainer.startSession.useMutation();
  const score = trpc.trainer.scoreSession.useMutation();

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const handleStart = useCallback(async () => {
    // Clear leftovers from a previous errored attempt so the retry starts fresh.
    stopTimer();
    void convRef.current?.endSession().catch(() => undefined);
    convRef.current = null;
    setTranscript([]);
    setHints([]);
    setSeconds(0);
    setPhase("connecting");
    try {
      // Permission pre-check only — release the tracks immediately, otherwise
      // this stray stream keeps the browser's mic indicator on forever (the
      // ElevenLabs SDK opens its own stream for the actual call).
      const micProbe = await navigator.mediaDevices.getUserMedia({ audio: true });
      micProbe.getTracks().forEach((t) => t.stop());
      const cfg = await startSession.mutateAsync({ leadId, personaId });
      const { Conversation } = await import("@elevenlabs/client");
      const conv = await Conversation.startSession({
        signedUrl: cfg.signedUrl,
        overrides: cfg.overrides,
        onConnect: () => {
          setPhase("active");
          timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        },
        onDisconnect: () => stopTimer(),
        onError: (message: string) => { setPhase("error"); toast.error(message || "Voice connection error"); },
        onMessage: ({ source, message }: { source: "user" | "ai"; message: string }) => {
          const role: TranscriptEntry["role"] = source === "user" ? "user" : "agent";
          setTranscript((prev) => [...prev, { role, text: message, at: Date.now() }]);
          if (source === "ai") {
            const h = matchHint(message);
            if (h) setHints((prev) => (prev.includes(h) ? prev : [h, ...prev].slice(0, 3)));
          }
        },
      } as Parameters<typeof Conversation.startSession>[0]);
      convRef.current = conv as unknown as ActiveConversation;
    } catch (e) {
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Could not start the call");
    }
  }, [leadId, personaId, startSession]);

  const handleEnd = useCallback(async () => {
    stopTimer();
    try { await convRef.current?.endSession(); } catch { /* already closed */ }
    convRef.current = null;
    setPhase("scoring");
    try {
      const res = await score.mutateAsync({ leadId, personaId, transcript, durationSeconds: seconds });
      setScorecard(res.scorecard);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scoring failed");
    }
    setPhase("done");
  }, [leadId, personaId, transcript, seconds, score]);

  useEffect(() => () => { stopTimer(); void convRef.current?.endSession(); }, []);

  if (phase === "idle" || phase === "connecting" || phase === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Mic size={26} className="text-primary" />
        </div>
        <div>
          <p className="font-medium">{phase === "error" ? "Something went wrong" : "Ready to practice"}</p>
          <p className="text-sm text-muted-foreground">
            {phase === "error"
              ? "The call could not be started or was interrupted."
              : "Your microphone will be used for this call."}
          </p>
        </div>
        <Button onClick={handleStart} disabled={phase === "connecting"} className="bg-green-600 hover:bg-green-700">
          {phase === "connecting"
            ? <><Loader2 size={16} className="animate-spin" /> Connecting…</>
            : phase === "error" ? <><RotateCcw size={16} /> Try again</> : "Start Practice Call"}
        </Button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Scorecard</h3>
            <Button variant="outline" size="sm" onClick={onReset}><RotateCcw size={14} /> Try again</Button>
          </div>
          {scorecard ? (
            <>
              <div className="mb-4 grid grid-cols-4 gap-2 text-center">
                {([
                  ["Overall", scorecard.overallScore],
                  ["Opening", scorecard.opening.score],
                  ["Objections", scorecard.objectionHandling.score],
                  ["Close", scorecard.callToAction.score],
                ] as const).map(([label, val]) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/40 p-2">
                    <div className={`text-lg font-bold ${scoreColor(val)}`}>{val}</div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium text-green-700">Highlights</p>
                <ul className="list-disc pl-5 text-muted-foreground">{scorecard.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
                <p className="font-medium text-amber-700">To improve</p>
                <ul className="list-disc pl-5 text-muted-foreground">{scorecard.improvements.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Scoring is unavailable (set <code>DEEPSEEK_API_KEY</code>). Your transcript is saved.</p>
          )}
        </div>
        <TranscriptPanel transcript={transcript} title="Transcript" />
      </div>
    );
  }

  // active / scoring
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-600">{phase === "scoring" ? "Scoring…" : "Connected"}</span>
          </div>
          <span className="text-sm text-muted-foreground">{fmt(seconds)}</span>
        </div>
        <TranscriptBody transcript={transcript} />
        <Button onClick={handleEnd} disabled={phase === "scoring"} variant="destructive" className="mt-4 w-full">
          {phase === "scoring" ? <><Loader2 size={16} className="animate-spin" /> Scoring…</> : <><PhoneOff size={16} /> End Call</>}
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-1 font-semibold">Live Coaching</h3>
        <p className="mb-3 text-xs text-muted-foreground">Triggered by the conversation</p>
        {hints.length === 0 && <p className="text-sm text-muted-foreground">Hints will appear as the prospect speaks.</p>}
        <div className="space-y-2">
          {hints.map((h, i) => (
            <div key={h} className={i === 0 ? "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" : "rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"}>
              {h}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TranscriptBody({ transcript }: { transcript: TranscriptEntry[] }) {
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-sm">
      {transcript.length === 0 && <p className="text-muted-foreground">Transcript will appear here…</p>}
      {transcript.map((t, i) => (
        <p key={i}>
          <span className={t.role === "user" ? "font-medium text-blue-600" : "font-medium text-muted-foreground"}>
            {t.role === "user" ? "You: " : "Prospect: "}
          </span>
          {t.text}
        </p>
      ))}
    </div>
  );
}

function TranscriptPanel({ transcript, title }: { transcript: TranscriptEntry[]; title: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <TranscriptBody transcript={transcript} />
    </div>
  );
}
