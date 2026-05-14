"use client";

import { Flame, Phone, Snowflake, Sun } from "lucide-react";
import {
  STATUS_LABELS,
  tempLabel,
  type LeadTemperature,
} from "./shared";

export function StageTag({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? STATUS_LABELS.NOT_CONTACTED;
  return <span className={`crm-tag ${config.cls}`}>{config.label}</span>;
}

export function ScoreBar({
  score,
  temp,
  showNum = true,
}: {
  score: number;
  temp: LeadTemperature;
  showNum?: boolean;
}) {
  return (
    <span className="crm-score">
      {showNum ? <span className="crm-score-num">{score}</span> : null}
      <span className={`crm-score-bar t-${temp}`}>
        <span style={{ width: `${score}%`, display: "block", height: "100%" }} />
      </span>
    </span>
  );
}

export function TempPill({ temp }: { temp: LeadTemperature }) {
  const Icon = temp === "hot" ? Flame : temp === "warm" ? Sun : Snowflake;
  return (
    <span className={`crm-temp t-${temp}`}>
      <Icon size={11} />
      {tempLabel(temp)}
    </span>
  );
}

export function Touches({ count, max = 6 }: { count: number; max?: number }) {
  return (
    <span className="crm-touches">
      {Array.from({ length: max }).map((_, index) => (
        <span key={index} className={`dot ${index < count ? "" : "empty"}`} />
      ))}
      <span className="num">{count}</span>
    </span>
  );
}

export function NextActionChip({
  label,
  state,
}: {
  label?: string;
  state?: "due" | "today" | "upcoming";
}) {
  if (!label) {
    return <span style={{ color: "var(--crm-fg-faint)", fontSize: 12 }}>-</span>;
  }

  return (
    <span className={`crm-next ${state ?? ""}`}>
      <Phone size={11} />
      <span className="label">{label}</span>
    </span>
  );
}
