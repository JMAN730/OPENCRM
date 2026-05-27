"use client";

import { usePathname } from "next/navigation";
import { Bell, Inbox, Sparkles, Menu, Sun, Moon, Send, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { trpc } from "@/app/_trpc/client";

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
  "How many leads do I have?",
  "What tasks are due today?",
  "Which leads are starred?",
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess(data) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    },
    onError(err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry, something went wrong: ${err.message}` },
      ]);
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatMutation.isPending]);

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
    if (!trimmed || chatMutation.isPending) return;
    const next: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: trimmed },
    ];
    setChatMessages(next);
    setChatInput("");
    chatMutation.mutate({ messages: next });
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
          Ask AI
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
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>Ask AI</span>
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
                      Hi! I can answer questions about your leads, tasks, and pipeline.
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
                          }
                        : {
                            background: "var(--crm-surface-2)",
                            color: "var(--crm-fg)",
                            borderRadius: "2px 12px 12px 12px",
                            padding: "8px 12px",
                            fontSize: 13,
                            lineHeight: 1.5,
                            maxWidth: "90%",
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                          }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {chatMutation.isPending && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      background: "var(--crm-surface-2)",
                      color: "var(--crm-fg-faint)",
                      borderRadius: "2px 12px 12px 12px",
                      padding: "10px 14px",
                      display: "flex",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <span className="crm-typing-dot" />
                    <span className="crm-typing-dot" />
                    <span className="crm-typing-dot" />
                  </div>
                </div>
              )}

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
                disabled={chatMutation.isPending}
              />
              <button
                className="crm-btn"
                style={{ padding: "0 12px", flexShrink: 0 }}
                onClick={() => sendMessage(chatInput)}
                disabled={chatMutation.isPending || !chatInput.trim()}
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
