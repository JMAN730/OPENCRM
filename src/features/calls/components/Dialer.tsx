"use client";

import { useEffect, useRef, useState } from "react";
import type { Call as TwilioCall, Device } from "@twilio/voice-sdk";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Phone, PhoneOff, Delete, Mic, MicOff, Volume2, History, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { trpc } from "@/app/_trpc/client";
import { ScriptsPanel } from "@/features/scripts/components/ScriptsPanel";
import { formatDistanceToNow } from "date-fns";

const STATUS_BADGES: Record<string, string> = {
  CONNECTED: "bg-green-100 text-green-700",
  BUSY: "bg-yellow-100 text-yellow-700",
  NO_ANSWER: "bg-yellow-100 text-yellow-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELED: "bg-gray-100 text-gray-600",
};

function mapCallStatus(twilioStatus: string): "BUSY" | "NO_ANSWER" | "CONNECTED" | "FAILED" | "CANCELED" {
  switch (twilioStatus) {
    case "open": return "CONNECTED";
    case "busy": return "BUSY";
    case "no-answer": return "NO_ANSWER";
    case "canceled": return "CANCELED";
    default: return "FAILED";
  }
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface DialerProps {
  leadId?: string;
  initialPhone?: string;
}

export function Dialer({ leadId, initialPhone }: DialerProps) {
  const [phoneNumber, setPhoneNumber] = useState(initialPhone ?? "");
  const [isInCall, setIsInCall] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  // window.isSecureContext is the authoritative browser check for WebRTC eligibility
  // (true for HTTPS or localhost, false for plain HTTP on any other host)
  const isInsecureContext =
    typeof window !== "undefined" && !window.isSecureContext;

  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<TwilioCall | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: tokenData, error: tokenError } = trpc.calls.generateToken.useQuery(undefined, {
    retry: false,
  });
  const logCallMutation = trpc.calls.logCall.useMutation();
  const { data: recentCalls, refetch: refetchRecent } = trpc.calls.getRecent.useQuery();

  // Initialize Twilio Device when token arrives
  useEffect(() => {
    if (!tokenData?.token) return;
    // Twilio Voice SDK requires WebRTC (secure context). Skip init on HTTP non-localhost
    // so we don't get a cryptic SDK error — the UI already shows the HTTPS banner.
    if (isInsecureContext) return;

    let device: Device;
    (async () => {
      try {
        const { Device: TwilioDevice } = await import("@twilio/voice-sdk");
        device = new TwilioDevice(tokenData.token, { logLevel: "warn" });

        device.on("registered", () => {
          setDeviceReady(true);
          setDeviceError(null);
        });
        device.on("error", (err: { message: string; code?: number }) => {
          const msg = err?.message ?? "Unknown dialer error";
          setDeviceError(msg);
          toast.error(`Dialer error: ${msg}`);
        });

        await device.register();
        deviceRef.current = device;
      } catch (err) {
        // The SDK may throw non-Error objects — extract the message robustly
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : (err as { message?: string })?.message
                ?? JSON.stringify(err)
                ?? "Failed to initialize dialer";
        console.error("[Dialer] Device init failed:", err);
        setDeviceError(msg);
      }
    })();

    return () => {
      device?.destroy();
      deviceRef.current = null;
      setDeviceReady(false);
      setDeviceError(null);
    };
  }, [tokenData?.token, isInsecureContext]);

  // Duration timer while in call
  useEffect(() => {
    if (!isInCall) return;
    timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    };
  }, [isInCall]);

  const handleNumberClick = (num: string) => {
    if (phoneNumber.length < 15) setPhoneNumber((prev) => prev + num);
    // Send DTMF if in a live call
    activeCallRef.current?.sendDigits(num);
  };

  const handleDelete = () => setPhoneNumber((prev) => prev.slice(0, -1));

  const startCall = async () => {
    if (!phoneNumber) { toast.error("Please enter a phone number"); return; }
    if (!deviceRef.current || !deviceReady) {
      toast.error("Dialer not ready — check Twilio configuration");
      return;
    }

    setIsConnecting(true);
    try {
      const call = await deviceRef.current.connect({ params: { To: phoneNumber } });
      activeCallRef.current = call;
      setIsInCall(true);
      setIsConnecting(false);
      toast.success(`Calling ${phoneNumber}…`);

      call.on("accept", () => { /* call connected */ });

      call.on("disconnect", () => {
        const status = mapCallStatus(call.status());
        activeCallRef.current = null;
        setIsInCall(false);
        setIsMuted(false);
        const duration = callDuration > 0 ? callDuration : undefined;
        logCallMutation.mutate(
          {
            leadId,
            status,
            duration,
            twilioCallSid: call.parameters.CallSid,
          },
          { onSuccess: () => refetchRecent() }
        );
        toast.info("Call ended");
      });

      call.on("cancel", () => {
        activeCallRef.current = null;
        setIsInCall(false);
        setIsConnecting(false);
      });

      call.on("error", (err: { message: string }) => {
        toast.error(`Call error: ${err.message}`);
        activeCallRef.current = null;
        setIsInCall(false);
        setIsConnecting(false);
      });
    } catch (err) {
      toast.error("Failed to start call");
      setIsConnecting(false);
    }
  };

  const endCall = () => {
    activeCallRef.current?.disconnect();
  };

  const toggleMute = () => {
    if (!activeCallRef.current) return;
    const next = !isMuted;
    activeCallRef.current.mute(next);
    setIsMuted(next);
  };

  const twilioUnconfigured = tokenError?.data?.code === "PRECONDITION_FAILED";
  // Show HTTPS banner if on insecure context but Twilio IS configured
  const showHttpsWarning = isInsecureContext && !twilioUnconfigured;
  const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <Card className="lg:col-span-1 border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <Phone size={20} className="text-primary" />
            Dialer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="relative">
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="text-2xl h-14 text-center font-bold tracking-widest"
              placeholder="000-000-0000"
              disabled={isInCall}
            />
            {phoneNumber && !isInCall && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={handleDelete}
              >
                <Delete size={20} className="text-muted-foreground" />
              </Button>
            )}
          </div>

          {isInCall && (
            <div className="text-center text-lg font-mono text-muted-foreground">
              {formatDuration(callDuration)}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {keypad.map((key) => (
              <Button
                key={key}
                variant="outline"
                className="h-16 text-xl font-semibold hover:bg-primary hover:text-primary-foreground transition-all"
                onClick={() => handleNumberClick(key)}
              >
                {key}
              </Button>
            ))}
          </div>

          <div className="flex justify-center gap-4">
            {isInCall && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className={cn(
                    "h-14 w-14 rounded-full",
                    isMuted && "bg-destructive/10 text-destructive border-destructive/20"
                  )}
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </Button>
                <Button variant="outline" size="icon" className="h-14 w-14 rounded-full">
                  <Volume2 size={24} />
                </Button>
              </>
            )}
            <Button
              className={cn(
                "h-14 w-14 rounded-full shadow-lg transition-all",
                isInCall
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-green-500 hover:bg-green-600"
              )}
              disabled={isConnecting || (!isInCall && !deviceReady)}
              onClick={isInCall ? endCall : startCall}
            >
              {isInCall ? <PhoneOff size={24} /> : <Phone size={24} />}
            </Button>
          </div>

          {!deviceReady && !isInCall && !twilioUnconfigured && (
            isInsecureContext ? (
              <p className="text-xs text-center text-destructive font-medium">
                HTTPS required — open the app over https:// to use the dialer
              </p>
            ) : deviceError ? (
              <p className="text-xs text-center text-destructive" title={deviceError}>
                Dialer error: {deviceError.length > 60 ? deviceError.slice(0, 60) + "…" : deviceError}
              </p>
            ) : (
              <p className="text-xs text-center text-muted-foreground">
                {tokenData ? "Connecting to dialer…" : "Loading…"}
              </p>
            )
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1 border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <ScrollText size={20} className="text-primary" />
            Scripts
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-[560px] overflow-y-auto">
          <ScriptsPanel readOnly />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <History size={20} className="text-primary" />
            Call History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {twilioUnconfigured ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Phone size={36} className="text-muted-foreground/20" />
              <p className="text-sm font-medium text-muted-foreground">Twilio not configured</p>
              <p className="text-xs text-muted-foreground">
                Add TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, and TWILIO_TWIML_APP_SID
                to your environment variables.
              </p>
            </div>
          ) : showHttpsWarning ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Phone size={36} className="text-muted-foreground/20" />
              <p className="text-sm font-medium text-muted-foreground">HTTPS required</p>
              <p className="text-xs text-muted-foreground">
                The browser dialer uses WebRTC and requires a secure connection.
                Open the app over <strong>https://</strong> to place calls.
              </p>
            </div>
          ) : recentCalls && recentCalls.length > 0 ? (
            <ul className="divide-y divide-border">
              {recentCalls.map((call: { id: string; status: string; duration: number | null; createdAt: string | Date; lead: { firstName: string | null; lastName: string | null } | null }) => (
                <li key={call.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {call.lead
                        ? `${call.lead.firstName ?? ""} ${call.lead.lastName ?? ""}`.trim() || "Unknown"
                        : "No lead"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(call.createdAt), { addSuffix: true })}
                      {call.duration ? ` · ${formatDuration(call.duration)}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full shrink-0",
                      STATUS_BADGES[call.status] ?? "bg-gray-100 text-gray-600"
                    )}
                  >
                    {call.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <Phone size={36} className="text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">No calls yet.</p>
              <p className="text-xs text-muted-foreground">Calls you make will appear here.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
