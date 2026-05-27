"use client";

import { usePathname } from "next/navigation";
import { Bell, Inbox, Sparkles, Menu, Sun, Moon, Send, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { trpc } from "@/app/_trpc/client";
import { MarkdownMessage } from "@/components/ui/markdown";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/leads": "Leads",
  "/scraper": "Scraper",
  "/tasks": "Tasks",
  "/dialer": "Dialer unavailable",
  "/analytics": "Analytics",
  "/games/tic-tac-toe": "Tic-tac-toe",
  "/settings": "Settings",
};

type Panel = "bell" | "inbox" | "ai" | null;
type ChatMessage = { role: "user" | "assistant"; content: string };

const POPOVER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 240,
  padding: "16px",
  zIndex: 200,
  boxShadow: "0 4px 24px rgba(0,0,0,.18)",
  borderRadius: "var(--crm-radius-md)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  textAlign: "center",
  animation: "crm-fade-in 0.12s ease-out",
};

const AI_POPOVER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 420,
  zIndex: 200,
  boxShadow: "0 4px 24px rgba(0,0,0,.18)",
  borderRadius: "var(--crm-radius-md)",
  overflow: "hidden",
  animation: "crm-fade-in 0.12s ease-out",
  display: "flex",
  flexDirection: "column",
};

const SUGGESTED_PROMPTS = [
  "Who is performing best?",
  "Why are leads not converting?",
  "Which niches should we focus on?",
  "Show pipeline bottlenecks",
  "Which city converts best?",
];

const subscribeToClientMounted = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const title =
    PAGE_TITLES[pathname] ??
    PAGE_TITLES[Object.keys(PAGE_TITLES).find((k) => pathname.startsWith(k)) ?? ""] ??
    "Dashboard";

  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToClientMounted,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );
  const isDark = mounted && resolvedTheme === "dark";

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [photoContext, setPhotoContext] = useState<{ websiteId: string; businessName: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Append a chunk of streamed text to the trailing assistant message.
  function appendToken(token: string) {
    setChatMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last?.role === "assistant") {
        copy[copy.length - 1] = { ...last, content: last.content + token };
      }
      return copy;
    });
  }

  async function streamChat(messages: ChatMessage[]) {
    setIsStreaming(true);
    // Show the user message immediately + an empty assistant bubble to fill.
    setChatMessages([...messages, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok || !res.body) {
        appendToken(
          res.status === 429
            ? "Too many AI requests. Try again in a moment."
            : "Sorry, something went wrong. Please try again.",
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as { content?: string; error?: string };
            if (parsed.error) appendToken(`\n\n_Error: ${parsed.error}_`);
            else if (parsed.content) appendToken(parsed.content);
          } catch {
            // ignore malformed SSE fragments
          }
        }
      }
    } catch (err) {
      appendToken(`\n\nSorry, something went wrong: ${(err as Error).message}`);
    } finally {
      setIsStreaming(false);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setPhotosMutation = (trpc.websites.setPhotos as any).useMutation({
    onSuccess() {
      setChatMessages(prev => [...prev, {
        role: "assistant" as const,
        content: `Photos saved to ${photoContext?.businessName ?? "the demo site"}! Refresh the demo page to see them.`,
      }]);
      setPhotoContext(null);
    },
    onError(err: { message: string }) {
      setChatMessages(prev => [...prev, {
        role: "assistant" as const,
        content: `Couldn't save photos: ${err.message}`,
      }]);
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isStreaming]);

  useEffect(() => {
    function handlePhotoRequest(e: Event) {
      const { websiteId, businessName } = (e as CustomEvent<{ websiteId: string; businessName: string }>).detail;
      setPhotoContext({ websiteId, businessName });
      setOpenPanel("ai");
      setChatMessages([{
        role: "assistant",
        content: `I just generated a demo site for **${businessName}** but couldn't find any photos automatically (no Google Maps URL is attached to this lead).\n\nPaste up to 3 photo URLs (direct image links ending in .jpg, .png, .webp, etc.) and I'll add them to the demo right away!`,
      }]);
    }
    window.addEventListener("opulence:request-photos", handlePhotoRequest);
    return () => window.removeEventListener("opulence:request-photos", handlePhotoRequest);
  }, []);

  // Focus input and scroll to bottom whenever the AI panel opens
  useEffect(() => {
    if (openPanel === "ai") {
      setTimeout(() => {
        chatInputRef.current?.focus();
        chatEndRef.current?.scrollIntoView({ behavior: "instant" });
      }, 50);
    }
  }, [openPanel]);

  useEffect(() => {
    if (!openPanel) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openPanel]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setOpenPanel((p) => (p === "ai" ? null : "ai"));
      }
      if (e.key === "Escape") {
        setOpenPanel(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggle = (panel: Panel) => setOpenPanel((p) => (p === panel ? null : panel));

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || setPhotosMutation.isPending) return;

    // Photo collection mode: detect image URLs
    if (photoContext) {
      const urlRegex = /https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|avif|bmp|svg)(?:[?#]\S*)?/gi;
      const detected = trimmed.match(urlRegex) ?? [];
      if (detected.length > 0) {
        const next: ChatMessage[] = [...chatMessages, { role: "user", content: trimmed }];
        setChatMessages(next);
        setChatInput("");
        setPhotosMutation.mutate({ id: photoContext.websiteId, photos: detected.slice(0, 10) });
        return;
      }
    }

    const next: ChatMessage[] = [...chatMessages, { role: "user", content: trimmed }];
    setChatInput("");
    streamChat(next);
  }

  return (
    <div className="crm-topbar">
      <button
        className="crm-btn ghost icon crm-menu-toggle"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <Menu size={18} />
      </button>
      <div className="crm-crumbs">
        <span className="crm-current">{title}</span>
      </div>

      <div className="crm-topbar-actions" ref={panelRef} style={{ position: "relative" }}>
        <button
          className="crm-btn ghost icon"
          title="Notifications"
          aria-pressed={openPanel === "bell"}
          onClick={() => toggle("bell")}
        >
          <Bell size={15} />
        </button>
        <button
          className="crm-btn ghost icon"
          title="Inbox"
          aria-pressed={openPanel === "inbox"}
          onClick={() => toggle("inbox")}
        >
          <Inbox size={15} />
        </button>
        <button
          className="crm-btn ghost icon"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          suppressHydrationWarning
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <div style={{ width: 1, height: 20, background: "var(--crm-border)", margin: "0 4px" }} />
        <button
          className="crm-btn"
          aria-pressed={openPanel === "ai"}
          onClick={() => toggle("ai")}
        >
          <Sparkles size={14} />
          Opulence
          <span className="crm-kbd">⌘J</span>
        </button>

        {openPanel === "bell" && (
          <div className="crm-card" style={POPOVER_STYLE}>
            <span style={{ fontSize: 22 }}>🔔</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>No notifications</span>
            <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>
              You&apos;re all caught up.
            </span>
          </div>
        )}

        {openPanel === "inbox" && (
          <div className="crm-card" style={POPOVER_STYLE}>
            <span style={{ fontSize: 22 }}>📬</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>No messages</span>
            <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>
              Your inbox is empty.
            </span>
          </div>
        )}

        {openPanel === "ai" && (
          <div className="crm-card" style={AI_POPOVER_STYLE}>
            {/* Header strip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderBottom: "1px solid var(--crm-border)",
                background: "var(--crm-surface-2)",
              }}
            >
              <Sparkles size={14} style={{ color: "var(--crm-accent)" }} />
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Opulence</span>
              {chatMessages.length > 0 && (
                <button
                  className="crm-btn ghost"
                  style={{ fontSize: 11, padding: "2px 8px", height: "auto" }}
                  onClick={() => setChatMessages([])}
                >
                  Clear
                </button>
              )}
              <span className="crm-kbd" style={{ fontSize: 10 }}>⌘J</span>
              <button
                className="crm-btn ghost icon"
                style={{ width: 24, height: 24 }}
                onClick={() => setOpenPanel(null)}
                aria-label="Close"
              >
                <X size={13} />
              </button>
            </div>

            {/* Messages area */}
            <div
              style={{
                height: 320,
                overflowY: "auto",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {chatMessages.length === 0 && (
                <>
                  {/* Welcome message */}
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div
                      style={{
                        background: "var(--crm-surface-2)",
                        borderRadius: "2px 12px 12px 12px",
                        padding: "8px 12px",
                        fontSize: 13,
                        lineHeight: 1.5,
                        maxWidth: "90%",
                        color: "var(--crm-fg)",
                      }}
                    >
                      Hi! I&apos;m Opulence, your AI sales manager. Ask me who&apos;s performing best, why leads aren&apos;t converting, or which niches and cities to focus on — I work from your live CRM analytics.
                    </div>
                  </div>
                  {/* Suggested prompts */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        className="crm-btn ghost"
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          height: "auto",
                          borderRadius: 20,
                          border: "1px solid var(--crm-border)",
                        }}
                        onClick={() => sendMessage(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={
                      msg.role === "user"
                        ? {
                            background: "var(--crm-accent)",
                            color: "#fff",
                            borderRadius: "12px 12px 2px 12px",
                            padding: "8px 12px",
                            fontSize: 13,
                            lineHeight: 1.5,
                            maxWidth: "80%",
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                          }
                        : {
                            background: "var(--crm-surface-2)",
                            color: "var(--crm-fg)",
                            borderRadius: "2px 12px 12px 12px",
                            padding: "8px 12px",
                            maxWidth: "90%",
                            wordBreak: "break-word",
                          }
                    }
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : msg.content === "" ? (
                      // Awaiting first streamed token — loading skeleton.
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 200, padding: "2px 0" }}>
                        <span className="crm-skeleton-line" style={{ width: "90%" }} />
                        <span className="crm-skeleton-line" style={{ width: "100%" }} />
                        <span className="crm-skeleton-line" style={{ width: "70%" }} />
                      </div>
                    ) : (
                      <MarkdownMessage content={msg.content} />
                    )}
                  </div>
                </div>
              ))}

              <div ref={chatEndRef} />
            </div>

            {/* Input footer */}
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "10px 14px",
                borderTop: "1px solid var(--crm-border)",
                background: "var(--crm-surface)",
              }}
            >
              <input
                ref={chatInputRef}
                className="crm-input"
                style={{ flex: 1, fontSize: 13 }}
                placeholder="Ask about your leads or tasks…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(chatInput);
                  }
                }}
                disabled={isStreaming}
              />
              <button
                className="crm-btn"
                style={{ padding: "0 12px", flexShrink: 0 }}
                onClick={() => sendMessage(chatInput)}
                disabled={isStreaming || !chatInput.trim()}
                aria-label="Send"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
