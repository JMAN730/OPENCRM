"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { trpc } from "@/app/_trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import { Phone, PhoneOff, Delete, Mic, MicOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Lead = inferRouterOutputs<AppRouter>["leads"]["getAll"][number];

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function leadName(l: Lead) {
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Unknown";
}

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const AVATAR_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6"];

export default function DialerPage() {
  const [digits, setDigits] = useState("");
  const [isInCall, setIsInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [queueIdx, setQueueIdx] = useState(0);

  const { data: leadsRaw, isLoading } = trpc.leads.getAll.useQuery();
  const leads: Lead[] = leadsRaw ?? [];
  const logCall = trpc.calls.logCall.useMutation();
  const utils = trpc.useUtils();

  const queue = leads.filter((l) => l.phone);
  const current = queue[queueIdx];
  const remaining = queue.length - queueIdx;

  const press = (k: string) => { if (digits.length < 15) setDigits((d) => d + k); };
  const del = () => setDigits((d) => d.slice(0, -1));

  const startCall = () => {
    if (!current && !digits) { toast.error("No number to dial"); return; }
    setIsInCall(true);
    toast.success(`Calling ${digits || current?.phone || (current ? leadName(current) : "")}…`);
  };

  const endCall = () => {
    setIsInCall(false);
    setIsMuted(false);
    if (current) {
      logCall.mutate({ leadId: current.id, status: "CONNECTED" }, {
        onSuccess: () => utils.dashboard.getKpiStats.invalidate(),
      });
    }
    toast.info("Call ended");
  };

  const skip = () => setQueueIdx((i) => Math.min(i + 1, queue.length - 1));

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Dialer</h1>
            <div className="crm-page-sub">Power dialer &amp; call queue · {remaining} remaining</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
          {/* Left — keypad + active call */}
          <div className="crm-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: 32 }}>
            {current && !isInCall && (
              <>
                <span className="crm-ribbon">Up next</span>
                <div className={`crm-avatar xl ${AVATAR_COLORS[queueIdx % AVATAR_COLORS.length]}`} style={{ marginTop: 4 }}>
                  {initials(leadName(current))}
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--crm-fg)" }}>
                    {leadName(current)}
                  </div>
                  {current.company && (
                    <div style={{ fontSize: 13, color: "var(--crm-fg-muted)", marginTop: 2 }}>{current.company}</div>
                  )}
                  {current.phone && (
                    <div style={{ fontFamily: "var(--crm-font-mono)", color: "var(--crm-fg-faint)", fontSize: 13, marginTop: 4 }}>{current.phone}</div>
                  )}
                </div>
              </>
            )}

            {!current && !isInCall && !isLoading && queue.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13, padding: "16px 0" }}>
                No leads with phone numbers in queue.<br />
                Dial manually below.
              </div>
            )}

            {isInCall && (
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: "var(--crm-pos)", fontFamily: "var(--crm-font-mono)" }}>● In call</div>
                <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, color: "var(--crm-fg)" }}>{digits || current?.phone || (current ? leadName(current) : "")}</div>
              </div>
            )}

            {/* Digit display */}
            <div style={{ position: "relative", width: "100%" }}>
              <div style={{
                height: 48, background: "var(--crm-surface-2)", border: "1px solid var(--crm-border)",
                borderRadius: "var(--crm-radius-sm)", display: "flex", alignItems: "center",
                justifyContent: "center", fontFamily: "var(--crm-font-mono)", fontSize: 22,
                fontWeight: 600, letterSpacing: "0.12em", color: "var(--crm-fg)",
                minHeight: 48,
              }}>
                {digits || <span style={{ color: "var(--crm-fg-faint)", fontSize: 14, letterSpacing: 0, fontWeight: 400 }}>Enter number</span>}
              </div>
              {digits && (
                <button
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--crm-fg-faint)", background: "none", border: 0, cursor: "pointer" }}
                  onClick={del}
                >
                  <Delete size={18} />
                </button>
              )}
            </div>

            {/* Keypad */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%" }}>
              {KEYPAD.map((k) => (
                <button key={k} onClick={() => press(k)} style={{
                  height: 52, borderRadius: "var(--crm-radius-sm)",
                  border: "1px solid var(--crm-border)", background: "var(--crm-surface)",
                  fontSize: 18, fontWeight: 600, color: "var(--crm-fg)", cursor: "pointer",
                  transition: "background 0.08s",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--crm-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--crm-surface)")}
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Call controls */}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              {isInCall ? (
                <>
                  <button onClick={() => setIsMuted((m) => !m)} style={{
                    width: 48, height: 48, borderRadius: "50%",
                    border: `1.5px solid ${isMuted ? "var(--crm-neg)" : "var(--crm-border)"}`,
                    background: isMuted ? "var(--crm-neg-soft)" : "var(--crm-surface)",
                    color: isMuted ? "var(--crm-neg)" : "var(--crm-fg-muted)",
                    display: "grid", placeItems: "center", cursor: "pointer",
                  }}>
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  <button onClick={endCall} style={{
                    height: 48, padding: "0 24px", borderRadius: "999px",
                    background: "var(--crm-neg)", color: "white", border: 0,
                    display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--crm-font-sans)",
                    fontSize: 14, fontWeight: 500, cursor: "pointer",
                  }}>
                    <PhoneOff size={16} /> End call
                  </button>
                </>
              ) : (
                <>
                  <button onClick={startCall} className="crm-btn primary" style={{
                    height: 44, padding: "0 24px", borderRadius: "999px", fontSize: 14, fontWeight: 500,
                  }}>
                    <Phone size={15} /> Start call
                  </button>
                  {current && (
                    <button onClick={skip} className="crm-btn" style={{ height: 44, padding: "0 18px", borderRadius: "999px" }}>
                      Skip
                    </button>
                  )}
                </>
              )}
            </div>

            <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", display: "flex", gap: 6, alignItems: "center" }}>
              <kbd style={{ padding: "2px 6px", border: "1px solid var(--crm-border)", borderRadius: 4, fontFamily: "var(--crm-font-mono)", fontSize: 11 }}>Space</kbd>
              to dial
            </div>
          </div>

          {/* Right — call queue */}
          <div className="crm-card flush">
            <div className="crm-card-head">
              <h3>Call queue</h3>
              <span className="crm-sub">· {remaining} remaining</span>
            </div>
            {queue.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--crm-fg-faint)", fontSize: 13 }}>
                {isLoading ? "Loading…" : "No leads with phone numbers yet"}
              </div>
            ) : (
              <table className="crm-table">
                <tbody>
                  {queue.map((u: Lead, i: number) => (
                    <tr key={u.id} style={{ opacity: i < queueIdx ? 0.35 : 1 }}>
                      <td className="mono" style={{ paddingRight: 0, width: 32 }}>
                        <span style={{ color: "var(--crm-fg-faint)" }}>{i + 1}</span>
                      </td>
                      <td>
                        <div className="crm-contact-cell">
                          <div className={`crm-avatar sm ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>{initials(leadName(u))}</div>
                          <div className="crm-meta">
                            <span className="crm-n">{leadName(u)}</span>
                            {u.company && <span className="crm-c">{u.company}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="mono right" style={{ color: "var(--crm-fg-faint)" }}>{u.phone}</td>
                      {i === queueIdx && (
                        <td style={{ width: 40 }}>
                          <span className="crm-ribbon">Now</span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
