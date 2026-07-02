"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { CreditCard, ExternalLink } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  TRIALING: { label: "Trial", color: "var(--crm-accent)" },
  ACTIVE: { label: "Active", color: "var(--crm-pos)" },
  PAST_DUE: { label: "Past due", color: "var(--crm-neg)" },
  CANCELED: { label: "Canceled", color: "var(--crm-fg-faint)" },
  UNPAID: { label: "Unpaid", color: "var(--crm-neg)" },
  NONE: { label: "No plan", color: "var(--crm-fg-faint)" },
};

type BillingPanelProps = {
  isAdmin: boolean;
};

export function BillingPanel({ isAdmin }: BillingPanelProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [renderedAt] = useState(() => Date.now());

  const { data, isLoading } = trpc.billing.getSubscription.useQuery();

  const checkout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message || "Failed to start checkout"),
  });

  const portal = trpc.billing.createPortalSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => toast.error(err.message || "Failed to open billing portal"),
  });

  useEffect(() => {
    const result = searchParams.get("checkout");
    if (!result) return;

    if (result === "success") {
      toast.success("Subscription updated. It may take a moment to reflect.");
      void utils.billing.getSubscription.invalidate();
    } else if (result === "canceled") {
      toast.message("Checkout canceled");
    }

    // Drop the checkout param so a remount doesn't repeat the toast.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("checkout");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  }, [searchParams, pathname, router, utils.billing.getSubscription]);

  if (isLoading || !data) {
    return <div style={{ color: "var(--crm-fg-faint)", fontSize: 13 }}>Loading billing…</div>;
  }

  const statusBadge = STATUS_LABELS[data.status] ?? STATUS_LABELS.NONE;
  const limits = data.limits;
  const trialDaysLeft =
    data.trialEndsAt && data.status === "TRIALING"
      ? Math.max(
          0,
          Math.ceil(
            (new Date(data.trialEndsAt).getTime() - renderedAt) / (24 * 60 * 60 * 1000),
          ),
        )
      : null;

  return (
    <div>
      {!data.configured && isAdmin && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: "var(--crm-radius-sm)",
            border: "1px solid var(--crm-border)",
            background: "var(--crm-surface-2)",
            fontSize: 13,
            color: "var(--crm-fg-muted)",
          }}
        >
          Stripe is not configured on this server. Set <code>STRIPE_SECRET_KEY</code> and price IDs to enable checkout.
        </div>
      )}

      {(data.status === "PAST_DUE" || data.status === "UNPAID") && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: "var(--crm-radius-sm)",
            border: "1px solid color-mix(in srgb, var(--crm-neg) 40%, transparent)",
            background: "color-mix(in srgb, var(--crm-neg) 8%, transparent)",
            fontSize: 13,
            color: "var(--crm-neg)",
          }}
        >
          Your subscription needs attention. Update your payment method to restore full access.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <MetricCard label="Plan" value={data.planLabel} />
        <MetricCard
          label="Status"
          value={
            <span style={{ color: statusBadge.color, fontWeight: 600 }}>{statusBadge.label}</span>
          }
        />
        <MetricCard label="Seats" value={`${data.seatsUsed} / ${data.seatLimit}`} />
        <MetricCard label="Tags limit" value={String(limits.maxTags)} />
      </div>

      {trialDaysLeft !== null && (
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--crm-fg-muted)" }}>
          {trialDaysLeft > 0
            ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your trial.`
            : "Your trial has ended."}
        </p>
      )}

      {data.currentPeriodEnd && data.status === "ACTIVE" && (
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--crm-fg-muted)" }}>
          {data.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
          {new Date(data.currentPeriodEnd).toLocaleDateString()}.
        </p>
      )}

      {isAdmin ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
          {/* Subscribed orgs change plans via the Stripe portal — a new
              checkout session would create a second subscription. */}
          {!data.hasStripeSubscription &&
            data.availableTiers
              .filter((tier) => tier.priceConfigured)
              .map((tier) => (
                <button
                  key={tier.tier}
                  className="crm-btn primary"
                  style={{ height: 32, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
                  disabled={!data.configured || checkout.isPending}
                  onClick={() => checkout.mutate({ planTier: tier.tier })}
                >
                  <CreditCard size={13} />
                  {checkout.isPending ? "Redirecting…" : `Choose ${tier.label}`}
                </button>
              ))}

          {data.configured && (
            <button
              className="crm-btn"
              style={{ height: 32, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
              disabled={portal.isPending}
              onClick={() => portal.mutate()}
            >
              <ExternalLink size={13} />
              {portal.isPending ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>
      ) : (
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--crm-fg-muted)" }}>
          Contact an organization admin to change your subscription.
        </p>
      )}

      <div style={{ borderTop: "1px solid var(--crm-border)", paddingTop: 16 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--crm-fg)" }}>
          Plan limits
        </h4>
        <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 13, color: "var(--crm-fg-muted)", lineHeight: 1.7 }}>
          <li>{limits.maxTags} tags</li>
          <li>{limits.maxScraperLocations} scraper locations per job</li>
          <li>{limits.maxScraperRecords} scraper records per job</li>
          <li>{data.seatLimit} team seats</li>
        </ul>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        border: "1px solid var(--crm-border)",
        borderRadius: "var(--crm-radius-sm)",
        background: "var(--crm-surface)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--crm-fg-faint)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--crm-fg)" }}>{value}</div>
    </div>
  );
}
