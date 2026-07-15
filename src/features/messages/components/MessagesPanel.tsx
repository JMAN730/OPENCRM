"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus, Send } from "lucide-react";
import { format, formatDistanceToNow, isToday } from "date-fns";

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email || "?";
  return source
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function MemberAvatar({
  user,
  size = "default",
}: {
  user: { name: string | null; email: string | null; image: string | null };
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size}>
      {user.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
      <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
    </Avatar>
  );
}

export function MessagesPanel() {
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  // Composer drafts are keyed by conversation so switching threads can never
  // carry text over and post it to the wrong person.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = selectedId ? (drafts[selectedId] ?? "") : "";
  const setDraft = (text: string) => {
    if (!selectedId) return;
    setDrafts((d) => ({ ...d, [selectedId]: text }));
  };

  const utils = trpc.useUtils();

  const conversations = trpc.messages.listConversations.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const thread = trpc.messages.getMessages.useQuery(
    { conversationId: selectedId ?? "" },
    { enabled: !!selectedId, refetchInterval: 5_000 },
  );
  const members = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: pickerOpen,
  });

  const start = trpc.messages.start.useMutation({
    onSuccess: (conversation) => {
      setPickerOpen(false);
      setMemberSearch("");
      setSelectedId(conversation.id);
      void utils.messages.listConversations.invalidate();
    },
    onError: (err) => toast.error(err.message || "Could not start conversation"),
  });

  const send = trpc.messages.send.useMutation({
    // Use the mutation variables, not the closed-over selectedId: the user may
    // have switched threads while the send was in flight. Only clear that
    // conversation's draft if it still holds the text that was just sent.
    onSuccess: (_data, variables) => {
      setDrafts((d) =>
        (d[variables.conversationId] ?? "").trim() === variables.body
          ? { ...d, [variables.conversationId]: "" }
          : d,
      );
      void utils.messages.getMessages.invalidate({
        conversationId: variables.conversationId,
      });
      void utils.messages.listConversations.invalidate();
    },
    onError: (err) => toast.error(err.message || "Message failed to send"),
  });

  const markRead = trpc.messages.markRead.useMutation({
    onSuccess: () => {
      void utils.messages.listConversations.invalidate();
      void utils.messages.unreadCount.invalidate();
    },
  });

  // Mark incoming messages read whenever the open thread shows unread ones.
  const lastMarkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId || !myId || !thread.data) return;
    const unread = thread.data.filter((m) => m.senderId !== myId && !m.readAt);
    if (unread.length === 0) return;
    const marker = `${selectedId}:${unread[unread.length - 1].id}`;
    if (lastMarkedRef.current === marker) return;
    lastMarkedRef.current = marker;
    markRead.mutate({ conversationId: selectedId });
  }, [selectedId, myId, thread.data, markRead]);

  // Keep the thread pinned to the newest message.
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageId = thread.data?.[thread.data.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [selectedId, lastMessageId]);

  const selectedConversation = useMemo(
    () => conversations.data?.find((c) => c.id === selectedId) ?? null,
    [conversations.data, selectedId],
  );

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return (members.data ?? [])
      .filter((m) => m.id !== myId)
      .filter(
        (m) =>
          !query ||
          m.name?.toLowerCase().includes(query) ||
          m.email?.toLowerCase().includes(query),
      );
  }, [members.data, memberSearch, myId]);

  const handleSend = () => {
    const body = draft.trim();
    if (!body || !selectedId || send.isPending) return;
    send.mutate({ conversationId: selectedId, body });
  };

  return (
    <div className="grid h-[calc(100vh-180px)] min-h-[420px] grid-cols-1 overflow-hidden rounded-xl border border-border bg-background md:grid-cols-[320px_1fr]">
      {/* Conversation list */}
      <div
        className={`flex flex-col border-border md:border-r ${selectedId ? "hidden md:flex" : ""}`}
      >
        <div className="flex items-center justify-between border-b border-border p-3">
          <span className="text-sm font-medium">Conversations</span>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <MessageSquarePlus data-icon="inline-start" />
            New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (conversations.data?.length ?? 0) === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet. Start one with a teammate to talk about deals.
            </div>
          ) : (
            conversations.data!.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted ${
                  c.id === selectedId ? "bg-muted" : ""
                }`}
              >
                <MemberAvatar user={c.otherUser} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.otherUser.name ?? c.otherUser.email}
                    </span>
                    {c.lastMessageAt && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(c.lastMessageAt), {
                          addSuffix: false,
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {c.lastMessage
                        ? `${c.lastMessage.senderId === myId ? "You: " : ""}${c.lastMessage.body}`
                        : "No messages yet"}
                    </span>
                    {c.unreadCount > 0 && <Badge>{c.unreadCount}</Badge>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={`flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {!selectedId || !selectedConversation ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Select a conversation or start a new one.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border p-3">
              <Button
                size="sm"
                variant="ghost"
                className="md:hidden"
                onClick={() => setSelectedId(null)}
              >
                Back
              </Button>
              <MemberAvatar user={selectedConversation.otherUser} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {selectedConversation.otherUser.name ??
                    selectedConversation.otherUser.email}
                </div>
                {selectedConversation.otherUser.name && (
                  <div className="truncate text-xs text-muted-foreground">
                    {selectedConversation.otherUser.email}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {thread.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-2/3" />
                  <Skeleton className="ml-auto h-10 w-2/3" />
                  <Skeleton className="h-10 w-1/2" />
                </div>
              ) : (
                thread.data?.map((m) => {
                  const mine = m.senderId === myId;
                  const sentAt = new Date(m.createdAt);
                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                          mine
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                        title={format(sentAt, "PPpp")}
                      >
                        {m.body}
                        <div
                          className={`mt-1 text-[10px] ${
                            mine
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          {isToday(sentAt) ? format(sentAt, "p") : format(sentAt, "MMM d, p")}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-center gap-2 border-t border-border p-3">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // isComposing guards IME input (CJK): Enter that confirms a
                  // composition candidate must not send the message.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Message ${
                  selectedConversation.otherUser.name ??
                  selectedConversation.otherUser.email
                }`}
                maxLength={4000}
              />
              <Button onClick={handleSend} disabled={!draft.trim() || send.isPending}>
                {send.isPending ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Send data-icon="inline-start" />
                )}
                Send
              </Button>
            </div>
          </>
        )}
      </div>

      {/* New-conversation member picker */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setMemberSearch("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
            <DialogDescription>
              Pick a member of your organization to message.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search members…"
            autoFocus
          />
          <div className="max-h-72 overflow-y-auto">
            {members.isLoading ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No other members found.
              </div>
            ) : (
              filteredMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={start.isPending}
                  onClick={() => start.mutate({ userId: m.id })}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <MemberAvatar user={m} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name ?? m.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </div>
                  </div>
                  {m.team && (
                    <Badge variant="outline" className="shrink-0">
                      {m.team.name}
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
