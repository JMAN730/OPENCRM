"use client";

import { trpc } from "@/app/_trpc/client";
import { useSession } from "next-auth/react";
import { AdminTeamsPanel } from "./team-page/AdminTeamsPanel";
import { TeamOverview } from "./team-page/TeamOverview";

export function TeamPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";
  const callerId = session?.user?.id;

  const { data: myTeam, isLoading: teamLoading } = trpc.teams.myTeam.useQuery();
  const { data: feed = [] } = trpc.teams.activityFeed.useQuery(
    { limit: 50 },
    { enabled: !!myTeam },
  );
  const { data: allTeams = [] } = trpc.teams.list.useQuery(undefined, {
    enabled: isAdmin,
  });
  const { data: orgMembers = [], isLoading: membersLoading } =
    trpc.teams.organizationMembers.useQuery(undefined, { enabled: isAdmin });

  const isLeader = !!myTeam && myTeam.leaderId === callerId;

  return (
    <div className="crm-content">
      <div className="crm-page-head">
        <div>
          <h1 className="crm-page-title">Team</h1>
          <div className="crm-page-sub">
            {myTeam
              ? `${myTeam.name} · ${myTeam.users.length} member${myTeam.users.length === 1 ? "" : "s"}`
              : isAdmin
                ? "Manage teams for your organization"
                : "You are not on a team yet"}
          </div>
        </div>
      </div>

      {!myTeam && !isAdmin ? (
        <div className="crm-card" style={{ padding: 32, textAlign: "center", color: "var(--crm-fg-faint)" }}>
          You are not on a team yet. Ask your admin to add you to one.
        </div>
      ) : null}

      {myTeam ? (
        <TeamOverview
          callerId={callerId}
          feed={feed}
          isAdmin={isAdmin}
          isLeader={isLeader}
          myTeam={myTeam}
        />
      ) : null}

      {isAdmin ? (
        <AdminTeamsPanel
          callerId={callerId}
          members={orgMembers}
          membersLoading={membersLoading}
          teams={allTeams}
        />
      ) : null}

      {teamLoading && !myTeam && !isAdmin ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--crm-fg-faint)" }}>
          Loading...
        </div>
      ) : null}
    </div>
  );
}
