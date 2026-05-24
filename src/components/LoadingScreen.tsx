"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const NB = "#5cc8ff";
const NV = "#a06bff";
const NP = "#ff5ce0";
const NW = "#eaf6ff";

const DURATION = 5; // seconds per loop
const MIN_DISPLAY_MS = 2600; // show at least past the logo lock at 2.4s

function Backdrop({ t }: { t: number }) {
  const offset = (t * 30) % 60;
  return (
    <>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 55% 55% at 50% 50%, #0c1226 0%, #04060d 70%, #02030a 100%)",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        opacity: 0.35,
        backgroundImage: `linear-gradient(rgba(92,200,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(92,200,255,0.10) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
        backgroundPosition: `${offset}px ${offset}px, ${offset}px ${offset}px`,
        maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black 0%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, black 0%, transparent 75%)",
      }} />
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: "40%",
        background:
          "radial-gradient(ellipse 50% 100% at 50% 100%, rgba(92,200,255,0.25), transparent 70%)," +
          "radial-gradient(ellipse 40% 80% at 30% 100%, rgba(160,107,255,0.20), transparent 70%)",
      }} />
    </>
  );
}

function HUDChrome({ t }: { t: number }) {
  const reveal = Math.min(1, Math.max(0, (t - 0.1) / 0.4));
  const fadeOut = t < 4.7 ? 1 : Math.max(0, 1 - (t - 4.7) / 0.3);
  const op = reveal * fadeOut;

  const corner = (style: CSSProperties) => (
    <div style={{
      position: "absolute", width: 36, height: 36,
      borderColor: NB, borderStyle: "solid", opacity: op, ...style,
    }} />
  );

  return (
    <>
      {corner({ left: 40, top: 40, borderWidth: "1.5px 0 0 1.5px" })}
      {corner({ right: 40, top: 40, borderWidth: "1.5px 1.5px 0 0" })}
      {corner({ left: 40, bottom: 40, borderWidth: "0 0 1.5px 1.5px" })}
      {corner({ right: 40, bottom: 40, borderWidth: "0 1.5px 1.5px 0" })}
      <div style={{
        position: "absolute", left: 86, top: 44,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase",
        color: NW, opacity: op * 0.85,
      }}>
        SBL · core ░ rev 02.4
      </div>
      <div style={{
        position: "absolute", right: 86, top: 48,
        display: "flex", alignItems: "center", gap: 8,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase",
        color: NW, opacity: op * 0.85,
      }}>
        <span>secure link</span>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: NB, boxShadow: `0 0 8px ${NB}`,
          opacity: Math.floor(t * 3) % 2 === 0 ? 1 : 0.25,
        }} />
      </div>
      <div style={{
        position: "absolute", left: 86, bottom: 48,
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase",
        color: NW, opacity: op * 0.5,
      }}>
        websites · systems · growth
      </div>
    </>
  );
}

function Rings({ t }: { t: number }) {
  const visIn = (start: number, dur: number) => Math.max(0, Math.min(1, (t - start) / dur));
  const holdFade = t < 4.7 ? 1 : Math.max(0, 1 - (t - 4.7) / 0.3);

  const ringDefs = [
    { r: 240, dash: "6 12", color: NB, speed: 22,  startScale: 1.6, delay: 0.20 },
    { r: 300, dash: "2 6",  color: NV, speed: -14, startScale: 1.4, delay: 0.35 },
    { r: 360, dash: "1 14", color: NP, speed: 10,  startScale: 1.3, delay: 0.50 },
  ];

  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
      {ringDefs.map((r, i) => {
        const p = visIn(r.delay, 1.4);
        const eased = 1 - Math.pow(1 - p, 3);
        const scale = r.startScale + (1 - r.startScale) * eased;
        const rot = t * r.speed;
        const C = 2 * Math.PI * r.r;
        return (
          <svg key={i} style={{
            position: "absolute",
            left: -r.r - 4, top: -r.r - 4,
            width: r.r * 2 + 8, height: r.r * 2 + 8,
            transform: `scale(${scale}) rotate(${rot}deg)`,
            opacity: eased * holdFade * (i === 0 ? 0.95 : i === 1 ? 0.75 : 0.55),
          }} viewBox={`0 0 ${r.r * 2 + 8} ${r.r * 2 + 8}`}>
            <circle cx={r.r + 4} cy={r.r + 4} r={r.r}
              fill="none" stroke={r.color} strokeWidth={i === 0 ? 1.6 : 1}
              strokeDasharray={r.dash}
              style={{ filter: `drop-shadow(0 0 6px ${r.color}) drop-shadow(0 0 14px ${r.color})` }} />
            <circle cx={r.r + 4} cy={r.r + 4} r={r.r}
              fill="none" stroke="#ffffff" strokeWidth="1.6"
              strokeDasharray={`${C * 0.18} ${C}`}
              strokeDashoffset={-C * ((t * 0.25 + i * 0.3) % 1)}
              strokeLinecap="round"
              opacity="0.9"
              style={{ filter: "drop-shadow(0 0 5px #fff)" }} />
          </svg>
        );
      })}
      {[0, 90, 180, 270].map(deg => (
        <div key={deg} style={{
          position: "absolute", left: 0, top: 0, width: 1, height: 1,
          transform: `rotate(${deg}deg) translate(0, -390px)`,
          opacity: visIn(0.4, 0.6) * holdFade,
        }}>
          <div style={{
            position: "absolute", left: -6, top: -1, width: 12, height: 2,
            background: NW, boxShadow: `0 0 8px ${NB}`,
          }} />
        </div>
      ))}
    </div>
  );
}

interface Particle {
  angle: number; radius: number; delay: number;
  dur: number; size: number; hue: string;
}

function ConvergeParticles({ t }: { t: number }) {
  const N = 60;
  const [seed] = useState<Particle[]>(() =>
    Array.from({ length: N }, (_, i) => ({
      angle: (i / N) * Math.PI * 2 + Math.random() * 0.6,
      radius: 500 + Math.random() * 300,
      delay: Math.random() * 0.9,
      dur: 1.2 + Math.random() * 0.5,
      size: 1.5 + Math.random() * 2.5,
      hue: i % 3 === 0 ? NP : i % 2 === 0 ? NV : NB,
    })),
  );

  if (t > 2.6) return null;

  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
      {seed.map((p, i) => {
        const localT = t - 0.4 - p.delay;
        if (localT < 0 || localT > p.dur) return null;
        const prog = localT / p.dur;
        const eased = prog * prog;
        const r = p.radius * (1 - eased);
        const x = Math.cos(p.angle) * r;
        const y = Math.sin(p.angle) * r;
        const opacity = Math.min(1, (1 - eased) * 1.8);
        return (
          <div key={i} style={{
            position: "absolute", left: x, top: y,
            width: p.size, height: p.size, borderRadius: "50%",
            background: p.hue,
            boxShadow: `0 0 ${p.size * 6}px ${p.hue}, 0 0 ${p.size * 2}px #fff`,
            opacity,
            transform: "translate(-50%, -50%)",
          }} />
        );
      })}
    </div>
  );
}

function LockBurst({ t }: { t: number }) {
  const localT = t - 2.4;
  if (localT < 0 || localT > 0.7) return null;
  const p = localT / 0.7;
  const eased = 1 - Math.pow(1 - p, 2);
  const opacity = (1 - p) * 0.85;
  const N = 14;
  return (
    <div style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }}>
      {Array.from({ length: N }, (_, i) => {
        const angle = (i / N) * Math.PI * 2 + (i % 2) * 0.18;
        const len = 40 + eased * 280;
        const start = 60 + eased * 50;
        return (
          <div key={i} style={{
            position: "absolute", left: 0, top: 0, width: 2, height: len,
            transformOrigin: "50% 0%",
            transform: `rotate(${angle}rad) translate(-1px, ${start}px)`,
            background: `linear-gradient(180deg, ${NW}, ${NB}, transparent)`,
            boxShadow: `0 0 8px ${NB}`,
            opacity, borderRadius: 1,
          }} />
        );
      })}
      <div style={{
        position: "absolute", left: 0, top: 0,
        width: 500, height: 500, marginLeft: -250, marginTop: -250,
        borderRadius: "50%",
        background: `radial-gradient(circle, rgba(255,255,255,${(1 - p) * 0.8}) 0%, rgba(92,200,255,${(1 - p) * 0.4}) 30%, transparent 60%)`,
      }} />
    </div>
  );
}

function CenterLogo({ t }: { t: number }) {
  if (t < 1.6) return null;
  const glitching = t < 2.4;
  const localT = t - 1.6;
  const scrambleAmt = glitching ? Math.max(0, 1 - localT / 0.8) : 0;
  const idleT = Math.max(0, t - 2.4);
  const pulse = 1 + Math.sin(idleT * 2.6) * 0.025 * (idleT < 2.3 ? 1 : 0);
  const fadeOut = t < 4.7 ? 1 : Math.max(0, 1 - (t - 4.7) / 0.3);
  const entryOpacity = Math.min(1, localT / 0.4);
  const jx = scrambleAmt > 0 ? Math.sin(t * 137.1) * 4 * scrambleAmt : 0;
  const jy = scrambleAmt > 0 ? Math.cos(t * 91.7) * 2.5 * scrambleAmt : 0;

  return (
    <div style={{
      position: "absolute", left: "50%", top: "50%",
      width: 280, height: 280, marginLeft: -140, marginTop: -140,
      transform: `translate(${jx}px, ${jy}px) scale(${pulse})`,
      opacity: entryOpacity * fadeOut,
    }}>
      <div style={{
        position: "absolute", inset: -60,
        background: `radial-gradient(circle, rgba(92,200,255,0.55), rgba(160,107,255,0.25) 45%, transparent 75%)`,
        filter: "blur(8px)",
        opacity: glitching ? 0.4 : 1,
      }} />
      {glitching && (
        <>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "url(/assets/sb-logo.png)",
            backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center",
            mixBlendMode: "screen",
            transform: `translateX(${scrambleAmt * 8}px)`,
            filter: `hue-rotate(180deg) saturate(2) brightness(1.4) drop-shadow(0 0 6px ${NP})`,
            opacity: scrambleAmt * 0.9,
          }} />
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "url(/assets/sb-logo.png)",
            backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center",
            mixBlendMode: "screen",
            transform: `translateX(${-scrambleAmt * 8}px)`,
            filter: `hue-rotate(60deg) saturate(2) brightness(1.4) drop-shadow(0 0 6px ${NV})`,
            opacity: scrambleAmt * 0.9,
          }} />
        </>
      )}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "url(/assets/sb-logo.png)",
        backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center",
        filter: `drop-shadow(0 0 18px ${NB}) drop-shadow(0 0 42px ${NB}) drop-shadow(0 0 72px ${NV})`,
      }} />
      {glitching && (
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(180deg, transparent ${(t * 200) % 100}%, rgba(255,255,255,0.35) ${(t * 200) % 100 + 2}%, transparent ${(t * 200) % 100 + 4}%)`,
          mixBlendMode: "overlay",
        }} />
      )}
    </div>
  );
}

function Progress({ t }: { t: number }) {
  const reveal = Math.min(1, Math.max(0, (t - 0.2) / 0.4));
  const fadeOut = t < 4.7 ? 1 : Math.max(0, 1 - (t - 4.7) / 0.3);
  const op = reveal * fadeOut;

  const pct = (() => {
    if (t < 0.6) return 0;
    if (t < 2.4) return ((t - 0.6) / 1.8) * 64;
    if (t < 3.4) return 64 + ((t - 2.4) / 1.0) * 28;
    if (t < 4.5) return 92 + ((t - 3.4) / 1.1) * 8;
    return 100;
  })();

  const status = (() => {
    if (t < 0.6) return "initializing core";
    if (t < 1.5) return "compiling systems";
    if (t < 2.4) return "syncing brand mark";
    if (t < 3.4) return "aligning signal";
    if (t < 4.5) return "finalizing";
    return "ready";
  })();

  return (
    <div style={{
      position: "absolute", left: "50%", top: "76%",
      transform: "translateX(-50%)", width: 560, opacity: op,
      fontFamily: '"JetBrains Mono", ui-monospace, monospace', color: NW,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 13, letterSpacing: "0.32em", textTransform: "uppercase",
        opacity: 0.85, marginBottom: 14,
      }}>
        <span style={{ color: NB }}>● {status}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: NW }}>
          {String(Math.floor(pct)).padStart(3, "0")}%
        </span>
      </div>
      <div style={{
        position: "relative", height: 3,
        background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
          background: `linear-gradient(90deg, ${NB}, ${NV}, ${NP})`,
          boxShadow: `0 0 12px ${NB}, 0 0 24px ${NV}`,
          transition: "width 120ms linear",
        }} />
        <div style={{
          position: "absolute", left: `${pct}%`, top: "50%",
          width: 8, height: 8, marginLeft: -4, marginTop: -4,
          borderRadius: "50%", background: "#fff",
          boxShadow: `0 0 12px #fff, 0 0 22px ${NB}`,
        }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 6, fontSize: 9, letterSpacing: "0.2em", opacity: 0.4,
      }}>
        {["00", "25", "50", "75", "100"].map(s => <span key={s}>{s}</span>)}
      </div>
    </div>
  );
}

function LockFlash({ t }: { t: number }) {
  const localT = t - 2.4;
  if (localT < 0 || localT > 0.35) return null;
  const a = (1 - localT / 0.35) * 0.55;
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "#ffffff", opacity: a, pointerEvents: "none",
    }} />
  );
}

interface LoadingScreenProps {
  sessionReady: boolean;
  onDone: () => void;
}

export function LoadingScreen({ sessionReady, onDone }: LoadingScreenProps) {
  const [t, setT] = useState(0);
  const [exiting, setExiting] = useState(false);
  const startRef = useRef<number | null>(null);
  const [mountTime] = useState(() => Date.now());
  const doneCalledRef = useRef(false);

  // rAF animation loop
  useEffect(() => {
    let rafId: number;
    const loop = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = (ts - startRef.current) / 1000;
      setT(elapsed % DURATION);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Trigger exit once session is ready AND minimum display time has elapsed
  useEffect(() => {
    if (!sessionReady || doneCalledRef.current) return;
    const elapsed = Date.now() - mountTime;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    const timer = setTimeout(() => {
      if (doneCalledRef.current) return;
      doneCalledRef.current = true;
      setExiting(true);
      setTimeout(onDone, 400);
    }, remaining);
    return () => clearTimeout(timer);
  }, [sessionReady, onDone, mountTime]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#04060d", overflow: "hidden",
      fontFamily: "Inter, system-ui, sans-serif",
      transition: exiting ? "opacity 400ms ease-out" : undefined,
      opacity: exiting ? 0 : 1,
    }}>
      <Backdrop t={t} />
      <HUDChrome t={t} />
      <Rings t={t} />
      <ConvergeParticles t={t} />
      <CenterLogo t={t} />
      <LockBurst t={t} />
      <Progress t={t} />
      <LockFlash t={t} />
    </div>
  );
}
