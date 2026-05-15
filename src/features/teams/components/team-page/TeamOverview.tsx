"use client";

import Link from "next/link";
import { Crown, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/app/_trpc/client";
import {
  ACTIVITY_VERB,
  avatarClass,
  initials,
  relativeTime,
  type MyTeam,
  type TeamActivity,
} from "./shared";

type TeamOverviewProps = {
  callerId: string | undefined;
  isAdmin: boolean;
  isLeader: boolean;
  myTeam: NonNullable<MyTeam>;
};

const PAGE_SIZE = 10;

export function TeamOverview({
  callerId,
  isAdmin,
  isLeader,
  myTeam,
}: TeamOverviewProps) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<TeamActivity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Track which cursors we've already merged to avoid double-appending
  const mergedCursors = useRef<Set<string | undefined>>(new Set());

  const { data, isFetching } = trpc.teams.activityFeed.useQuery(
    { limit: PAGE_SIZE, cursor },
    { enabled: !!myTeam },
  );

  useEffect(() => {
    if (!data) return;
    const key = cursor ?? "__initial__";
    if (mergedCursors.current.has(key)) return;
    mergedCursors.current.add(key);
    setAllItems((prev) => [...prev, ...data.items]);
    setNextCursor(data.nextCursor);
  }, [data, cursor]);

  const loadMore = () => {
    if (nextCursor && !isFetching) setCursor(nextCursor);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
      <div className="crm-card flush">
        <div className="crm-card-head">
          <h3>Members</h3>
          <span className="crm-sub">· {myTeam.users.length}</span>
        </div>
        <div>
          {myTeam.users.map((user) => {
            const canViewDetail = isAdmin || isLeader || user.id === callerId;
            const isLeaderOfTeam = myTeam.leaderId === user.id;
            const row = (
              <div
                key={user.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderTop: "1px solid var(--crm-border)",
                  cursor: canViewDetail ? "pointer" : "default",
                }}
              >
                <div className={`crm-avatar sm ${avatarClass(user.name)}`}>
                  {initials(user.name || user.email)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="crm-n">{user.name || user.email}</span>
                    {isLeaderOfTeam ? (
                      <span
                        title="Team leader"
                        style={{ color: "var(--crm-warn, #d4a017)", display: "inline-flex" }}
                      >
                        <Crown size={12} />
                      </span>
                    ) : null}
                  </div>
                  {user.email ? (
                    <div style={{ fontSize: 11.5, color: "var(--crm-fg-faint)" }}>{user.email}</div>
                  ) : null}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--crm-fg-faint)",
                    textTransform: "uppercase",
                  }}
                >
                  {user.role}
                </span>
              </div>
            );

            return canViewDetail ? (
              <Link
                key={user.id}
                href={`/team/${user.id}`}
                style={{ textDecoration: "none", color: "inherit", display: "block" }}
              >
                {row}
              </Link>
            ) : (
              row
            );
          })}
        </div>
      </div>

      <div className="crm-card flush">
        <div className="crm-card-head">
          <h3>Team activity</h3>
          <span className="crm-sub">· {allItems.length} shown</span>
        </div>
        <div>
          {allItems.length === 0 && isFetching ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--crm-fg-faint)" }}>
              <Loader2 size={16} style={{ display: "inline" }} />
            </div>
          ) : allItems.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--crm-fg-faint)" }}>
              No recent activity from your team.
            </div>
          ) : (
            <>
              {allItems.map((activity) => {
                const verb = ACTIVITY_VERB[activity.type] ?? activity.type.toLowerCase();
                const leadLabel =
                  [activity.lead?.firstName, activity.lead?.lastName].filter(Boolean).join(" ") ||
                  activity.lead?.company ||
                  "(lead)";

                return (
                  <div
                    key={activity.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "10px 14px",
                      borderTop: "1px solid var(--crm-border)",
                      alignItems: "flex-start",
                    }}
                  >
                    <div className={`crm-avatar xs ${avatarClass(activity.user?.name)}`}>
                      {initials(activity.user?.name || activity.user?.email)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13 }}>
                        <strong>{activity.user?.name || activity.user?.email || "Someone"}</strong>{" "}
                        <span style={{ color: "var(--crm-fg-faint)" }}>{verb}</span>{" "}
                        <Link href="/leads" style={{ color: "var(--crm-fg)" }}>
                          {leadLabel}
                        </Link>
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--crm-fg-faint)",
                          marginTop: 1,
                        }}
                      >
                        {activity.description} · {relativeTime(activity.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {nextCursor && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderTop: "1px solid var(--crm-border)",
                    textAlign: "center",
                  }}
                >
                  <button
                    className="crm-btn ghost"
                    style={{ width: "100%", fontSize: 13 }}
                    onClick={loadMore}
                    disabled={isFetching}
                  >
                    {isFetching ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Loader2 size={13} />
                        Loading…
                      </span>
                    ) : (
                      "Show More"
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
