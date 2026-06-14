"use client";

import { useState } from "react";
import { trpc } from "@/app/_trpc/client";
import { toast } from "sonner";
import { Globe, Loader2, Copy, Check, ChevronRight, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TEMPLATES, getAccentColor, type WebsiteContent } from "@/features/websites/templates";

type Template = string;

type GeneratedWebsite = {
  id: string;
  template: string;
  title: string;
  content: unknown;
  createdAt: string | Date;
};

type Step = "choose" | "generating" | "edit";

type Props = {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildKabaHtml(title: string, content: WebsiteContent): string {
  const name = esc(content.hero.title);
  const city = esc(content.hero.tagline) || "your area";
  const phone = esc(content.contact.phone);
  const email = esc(content.contact.email);
  const address = esc(content.contact.address);
  const aboutBody = esc(content.about.body);
  const copyright = esc(content.footer.tagline);
  const initial = content.hero.title.charAt(0).toUpperCase();
  const telDigits = content.contact.phone.replace(/\D/g, "");
  const telHref = telDigits ? `tel:+1${telDigits}` : "#";

  const defaultPrices = [
    { from: "$69", unit: "/ change" },
    { from: "$185", unit: "/ axle" },
    { from: "$220", unit: "installed" },
    { from: "$95", unit: "/ scan" },
    { from: "$240", unit: "+ parts" },
    { from: "$160", unit: "starting" },
    { from: "$149", unit: "flat" },
    { from: "$129", unit: "+ refrig." },
    { from: "$35", unit: "/ tire" },
  ];

  const servicesJson = JSON.stringify(
    content.services.map((s, i) => ({
      n: String(i + 1).padStart(2, "0"),
      title: s.title,
      from: defaultPrices[i]?.from ?? "$—",
      unit: defaultPrices[i]?.unit ?? "",
      blurb: s.description,
    }))
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#0f1417;--ink-2:#171c21;--ink-3:#222a31;--line:#2a333b;
    --cream:#f4f1ea;--cream-2:#e8e3d6;--amber:#f5a524;--amber-deep:#d98a0b;
    --muted:#8a8275;
    --display:'Anton','Archivo Black',Impact,sans-serif;
    --body:'Manrope',system-ui,sans-serif;
    --mono:'JetBrains Mono',ui-monospace,monospace;
  }
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:var(--body);background:var(--ink);color:var(--cream);-webkit-font-smoothing:antialiased}
  a{color:inherit;text-decoration:none}
  button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
  ::selection{background:var(--amber);color:var(--ink)}
  .wrap{max-width:1400px;margin:0 auto;padding:0 32px}
  @media(max-width:640px){.wrap{padding:0 20px}}
  .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--amber)}
  .eyebrow .dot{display:inline-block;width:6px;height:6px;background:var(--amber);border-radius:50%;margin-right:8px;transform:translateY(-2px)}
  .display{font-family:var(--display);font-weight:400;line-height:.86;letter-spacing:-.01em;text-transform:uppercase}
  .topbar{background:#000;color:var(--cream-2);font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase}
  .topbar-row{display:flex;justify-content:space-between;align-items:center;height:34px}
  .topbar-row span{display:inline-flex;align-items:center;gap:8px}
  .topbar-row .pulse{width:7px;height:7px;background:#22d36a;border-radius:50%;box-shadow:0 0 0 0 rgba(34,211,106,.7);animation:pulse 2s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(34,211,106,.7)}70%{box-shadow:0 0 0 10px rgba(34,211,106,0)}100%{box-shadow:0 0 0 0 rgba(34,211,106,0)}}
  nav.nav{position:sticky;top:0;z-index:50;background:rgba(15,20,23,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
  .nav-row{display:flex;align-items:center;justify-content:space-between;height:76px;gap:24px}
  .logo{display:flex;align-items:center;gap:12px}
  .logo-mark{width:44px;height:44px;border-radius:8px;background:var(--amber);color:var(--ink);display:grid;place-items:center;font-family:var(--display);font-size:30px;line-height:1;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18)}
  .logo-text{display:flex;flex-direction:column;line-height:1}
  .logo-text strong{font-family:var(--display);font-size:22px;letter-spacing:.01em;text-transform:uppercase}
  .logo-text small{font-family:var(--mono);font-size:10px;letter-spacing:.18em;color:var(--muted);text-transform:uppercase;margin-top:3px}
  .nav-links{display:flex;gap:32px;font-weight:600;font-size:14px;letter-spacing:.02em}
  .nav-links a{position:relative;padding:8px 0;color:var(--cream-2)}
  .nav-links a:hover{color:var(--amber)}
  .nav-cta{display:flex;gap:12px;align-items:center}
  @media(max-width:880px){.nav-links{display:none}}
  .btn{display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border-radius:6px;font-weight:700;font-size:14px;letter-spacing:.04em;text-transform:uppercase;transition:transform .12s ease,background .15s ease,color .15s ease;white-space:nowrap}
  .btn:hover{transform:translateY(-1px)}
  .btn-amber{background:var(--amber);color:var(--ink)}
  .btn-amber:hover{background:#ffb733}
  .btn-ghost{background:transparent;color:var(--cream);border:1px solid var(--line)}
  .btn-ghost:hover{border-color:var(--amber);color:var(--amber)}
  .btn-lg{padding:18px 28px;font-size:15px}
  .btn .arrow{transition:transform .2s ease}
  .btn:hover .arrow{transform:translateX(3px)}
  .hero{position:relative;overflow:hidden;padding:64px 0 80px}
  .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}
  @media(max-width:1000px){.hero-grid{grid-template-columns:1fr;gap:40px}}
  .hero h1{font-family:var(--display);font-size:clamp(72px,11vw,176px);line-height:.84;letter-spacing:-.015em;text-transform:uppercase;margin:18px 0 0}
  .hero h1 .amber{color:var(--amber)}
  .hero h1 .stroke{-webkit-text-stroke:2px var(--cream);color:transparent}
  .hero-sub{margin:28px 0 0;font-size:18px;line-height:1.55;max-width:520px;color:var(--cream-2)}
  .hero-ctas{display:flex;gap:14px;margin-top:36px;flex-wrap:wrap}
  .hero-meta{display:flex;gap:24px;margin-top:44px;flex-wrap:wrap;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .hero-meta b{color:var(--cream);font-family:var(--display);font-size:26px;letter-spacing:.01em;display:block;margin-bottom:2px;font-weight:400}
  .hero-photo{position:relative;aspect-ratio:4/5;border-radius:10px;overflow:hidden;background:repeating-linear-gradient(45deg,#1d242a 0 18px,#1a2025 18px 36px);border:1px solid var(--line)}
  .hero-photo::before{content:"PHOTO · mechanic working at a car";position:absolute;inset:0;display:grid;place-items:center;font-family:var(--mono);font-size:12px;letter-spacing:.18em;color:rgba(244,241,234,.35);text-transform:uppercase;text-align:center;padding:24px}
  .hero-photo .badge{position:absolute;left:20px;top:20px;background:var(--amber);color:var(--ink);font-family:var(--mono);font-size:11px;letter-spacing:.14em;font-weight:700;padding:8px 12px;border-radius:4px;text-transform:uppercase;z-index:2}
  .hero-photo .ticker{position:absolute;left:0;right:0;bottom:0;background:#000;color:var(--cream);font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;padding:12px 16px;display:flex;justify-content:space-between;gap:16px;border-top:1px solid var(--amber);z-index:2}
  .hero-photo .ticker .amb{color:var(--amber)}
  .marquee{background:var(--amber);color:var(--ink);border-top:2px solid var(--ink);border-bottom:2px solid var(--ink);overflow:hidden}
  .marquee-track{display:flex;gap:48px;align-items:center;padding:18px 0;white-space:nowrap;font-family:var(--display);font-size:28px;letter-spacing:.02em;text-transform:uppercase;animation:scroll 40s linear infinite}
  .marquee-track span{display:inline-flex;align-items:center;gap:48px}
  .marquee-track .sep{display:inline-block;width:10px;height:10px;background:var(--ink);border-radius:50%}
  @keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  section.block{padding:120px 0;border-top:1px solid var(--line)}
  @media(max-width:640px){section.block{padding:80px 0}}
  .section-head{display:flex;justify-content:space-between;align-items:end;gap:32px;margin-bottom:56px;flex-wrap:wrap}
  .section-head h2{font-family:var(--display);font-size:clamp(48px,7vw,96px);line-height:.88;letter-spacing:-.01em;text-transform:uppercase;margin:10px 0 0;max-width:14ch}
  .section-head h2 .amber{color:var(--amber)}
  .section-head p{max-width:380px;color:var(--cream-2);font-size:16px;line-height:1.55;margin:0}
  .num{font-family:var(--mono);font-size:11px;letter-spacing:.18em;color:var(--muted);text-transform:uppercase}
  .services-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line)}
  @media(max-width:980px){.services-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:620px){.services-grid{grid-template-columns:1fr}}
  .svc{background:var(--ink);padding:36px 32px 32px;display:flex;flex-direction:column;gap:18px;position:relative;transition:background .2s ease;min-height:280px}
  .svc:hover{background:var(--ink-2)}
  .svc-num{font-family:var(--mono);font-size:11px;letter-spacing:.18em;color:var(--muted);text-transform:uppercase}
  .svc h3{font-family:var(--display);font-size:36px;line-height:.92;letter-spacing:.005em;text-transform:uppercase;margin:0;font-weight:400}
  .svc p{color:var(--cream-2);font-size:14px;line-height:1.55;margin:0;flex:1}
  .svc-foot{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-top:8px;padding-top:18px;border-top:1px solid var(--line)}
  .svc-price{font-family:var(--display);font-size:32px;letter-spacing:0;color:var(--amber);line-height:1}
  .svc-price small{font-family:var(--mono);font-size:10px;letter-spacing:.15em;color:var(--muted);display:block;margin-bottom:4px;text-transform:uppercase;font-weight:400}
  .svc-book{font-family:var(--mono);font-size:11px;letter-spacing:.15em;text-transform:uppercase;font-weight:700;color:var(--cream);display:inline-flex;align-items:center;gap:6px}
  .svc-book:hover{color:var(--amber)}
  .reviews-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  @media(max-width:980px){.reviews-grid{grid-template-columns:1fr}}
  .review{background:var(--ink-2);border:1px solid var(--line);border-radius:10px;padding:32px 28px;display:flex;flex-direction:column;gap:18px}
  .stars{display:flex;gap:3px;color:var(--amber);font-size:18px;letter-spacing:1px}
  .review blockquote{margin:0;font-size:18px;line-height:1.5;color:var(--cream)}
  .review blockquote .pull{font-family:var(--display);color:var(--amber);font-size:22px;line-height:1;display:block;margin-bottom:8px}
  .review-meta{display:flex;align-items:center;gap:12px;margin-top:auto;padding-top:18px;border-top:1px solid var(--line)}
  .review-meta .av{width:38px;height:38px;border-radius:50%;background:var(--ink-3);display:grid;place-items:center;font-family:var(--display);font-size:18px;color:var(--cream)}
  .review-meta strong{font-size:14px;font-weight:700}
  .review-meta small{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:block;margin-top:3px}
  .faq-wrap{max-width:900px;margin:0 auto}
  .qa{border-top:1px solid var(--line);padding:24px 0}
  .qa:last-child{border-bottom:1px solid var(--line)}
  .qa summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:24px;font-family:var(--display);font-size:clamp(22px,2.4vw,30px);letter-spacing:.005em;text-transform:uppercase}
  .qa summary::-webkit-details-marker{display:none}
  .qa .plus{width:36px;height:36px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;flex-shrink:0;transition:all .2s ease;font-family:var(--mono);font-size:18px}
  .qa[open] .plus{background:var(--amber);color:var(--ink);border-color:var(--amber);transform:rotate(45deg)}
  .qa p{margin:18px 0 0;color:var(--cream-2);font-size:16px;line-height:1.6;max-width:780px}
  .cta-band{background:var(--amber);color:var(--ink);padding:88px 0;position:relative;overflow:hidden}
  .cta-band .row{display:grid;grid-template-columns:1fr auto;gap:32px;align-items:center}
  @media(max-width:780px){.cta-band .row{grid-template-columns:1fr}}
  .cta-band h2{font-family:var(--display);font-size:clamp(48px,7vw,96px);line-height:.88;letter-spacing:-.01em;text-transform:uppercase;margin:0}
  .cta-band .actions{display:flex;gap:14px;flex-wrap:wrap}
  .btn-ink{background:var(--ink);color:var(--cream)}
  .btn-ink:hover{background:#000}
  .btn-line{background:transparent;color:var(--ink);border:2px solid var(--ink)}
  footer{background:#000;padding:64px 0 32px;border-top:1px solid var(--line)}
  .foot-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:40px}
  @media(max-width:780px){.foot-grid{grid-template-columns:1fr 1fr}}
  footer h4{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin:0 0 18px}
  footer ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;font-size:14px}
  footer ul a:hover{color:var(--amber)}
  .foot-bottom{display:flex;justify-content:space-between;align-items:center;margin-top:56px;padding-top:24px;border-top:1px solid var(--line);font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .modal-back{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:100;display:grid;place-items:center;padding:24px;opacity:0;pointer-events:none;transition:opacity .2s ease}
  .modal-back.open{opacity:1;pointer-events:auto}
  .modal{background:var(--ink-2);border:1px solid var(--line);border-radius:14px;max-width:720px;width:100%;max-height:92vh;overflow:hidden;display:grid;grid-template-rows:auto auto 1fr auto;transform:translateY(20px);transition:transform .25s ease}
  .modal-back.open .modal{transform:translateY(0)}
  .modal-head{display:flex;justify-content:space-between;align-items:center;padding:20px 28px;border-bottom:1px solid var(--line)}
  .modal-head strong{font-family:var(--display);font-size:22px;letter-spacing:.005em;text-transform:uppercase}
  .modal-head .close{width:36px;height:36px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center}
  .modal-head .close:hover{background:var(--ink);border-color:var(--amber);color:var(--amber)}
  .steps{display:flex;gap:0;padding:18px 28px;border-bottom:1px solid var(--line);background:var(--ink)}
  .step{flex:1;display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .step .n{width:22px;height:22px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:11px;color:var(--cream-2)}
  .step.active .n{background:var(--amber);color:var(--ink);border-color:var(--amber)}
  .step.done .n{background:var(--ink-3);color:var(--amber);border-color:var(--amber)}
  .step.active{color:var(--cream)}
  .step.done{color:var(--cream-2)}
  .modal-body{padding:32px 28px;overflow-y:auto}
  .modal-body h3{font-family:var(--display);font-size:32px;letter-spacing:.005em;text-transform:uppercase;margin:0 0 6px;font-weight:400}
  .modal-body .lead{color:var(--cream-2);font-size:14px;margin:0 0 22px}
  .pick-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media(max-width:560px){.pick-grid{grid-template-columns:1fr}}
  .pick{border:1px solid var(--line);border-radius:8px;padding:16px 18px;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:12px;transition:all .15s ease}
  .pick:hover{border-color:var(--amber)}
  .pick.sel{border-color:var(--amber);background:rgba(245,165,36,.08)}
  .pick strong{font-family:var(--display);font-size:18px;letter-spacing:.005em;text-transform:uppercase;font-weight:400}
  .pick small{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--muted);display:block;margin-top:4px;text-transform:uppercase}
  .pick .pp{font-family:var(--display);color:var(--amber);font-size:22px}
  .field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
  .field label{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  .field input,.field select{background:var(--ink);color:var(--cream);border:1px solid var(--line);padding:13px 14px;border-radius:6px;font:inherit;font-size:15px;outline:none;transition:border-color .15s ease}
  .field input:focus,.field select:focus{border-color:var(--amber)}
  .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:18px}
  .cal-day{aspect-ratio:1;display:grid;place-items:center;border:1px solid var(--line);border-radius:6px;font-family:var(--mono);font-size:13px;color:var(--cream);cursor:pointer;transition:all .12s ease;position:relative}
  .cal-day:hover:not(.disabled){border-color:var(--amber);color:var(--amber)}
  .cal-day.sel{background:var(--amber);color:var(--ink);border-color:var(--amber);font-weight:700}
  .cal-day.disabled{color:var(--ink-3);cursor:not-allowed;border-color:transparent}
  .cal-day.today::after{content:"";position:absolute;bottom:4px;width:4px;height:4px;border-radius:50%;background:currentColor}
  .cal-head{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:8px;font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);text-align:center}
  .month-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
  .month-nav strong{font-family:var(--display);font-size:20px;letter-spacing:.005em;text-transform:uppercase}
  .month-nav button{width:32px;height:32px;border-radius:6px;border:1px solid var(--line);display:grid;place-items:center}
  .month-nav button:hover{border-color:var(--amber);color:var(--amber)}
  .slots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  @media(max-width:560px){.slots{grid-template-columns:repeat(3,1fr)}}
  .slot{border:1px solid var(--line);border-radius:6px;padding:10px 4px;font-family:var(--mono);font-size:12px;letter-spacing:.04em;text-align:center;color:var(--cream-2);transition:all .12s ease}
  .slot:hover{border-color:var(--amber);color:var(--amber)}
  .slot.sel{background:var(--amber);color:var(--ink);border-color:var(--amber);font-weight:700}
  .modal-foot{display:flex;justify-content:space-between;align-items:center;padding:18px 28px;border-top:1px solid var(--line);background:var(--ink)}
  .summary-card{background:var(--ink);border:1px solid var(--line);border-radius:10px;padding:20px;margin-bottom:18px}
  .summary-card .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--line);font-size:14px}
  .summary-card .row:last-child{border-bottom:0;font-family:var(--display);font-size:24px;letter-spacing:.005em;color:var(--amber);padding-top:14px}
  .summary-card .row span:first-child{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
  .check-ok{width:88px;height:88px;border-radius:50%;background:var(--amber);color:var(--ink);display:grid;place-items:center;margin:0 auto 22px;font-size:42px}
  .modal-body.center{text-align:center}
  .phone-pop{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.95);background:var(--ink-2);border:1px solid var(--amber);border-radius:14px;padding:32px 36px;z-index:200;text-align:center;opacity:0;pointer-events:none;transition:all .2s ease}
  .phone-pop.open{opacity:1;pointer-events:auto;transform:translate(-50%,-50%) scale(1)}
  .phone-pop small{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:10px}
  .phone-pop strong{font-family:var(--display);font-size:48px;letter-spacing:.01em;color:var(--amber);display:block}
  .phone-pop .actions{display:flex;gap:10px;margin-top:18px;justify-content:center}
</style>
</head>
<body>

<div class="topbar">
  <div class="wrap topbar-row">
    <span><span class="pulse"></span> Open &middot; Mobile service today 7am&ndash;7pm</span>
    <span>${city} &middot; ASE Certified &middot; Insured</span>
  </div>
</div>

<nav class="nav">
  <div class="wrap nav-row">
    <a href="#" class="logo">
      <span class="logo-mark">${initial}</span>
      <span class="logo-text"><strong>${name}</strong><small>Mobile Mechanic &middot; ${city}</small></span>
    </a>
    <div class="nav-links">
      <a href="#services">Services</a>
      <a href="#reviews">Reviews</a>
      <a href="#faq">FAQ</a>
      <a href="#contact">Contact</a>
    </div>
    <div class="nav-cta">
      <a href="${telHref}" class="btn btn-ghost">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Call
      </a>
      <button class="btn btn-amber" data-book>Book service <span class="arrow">&rarr;</span></button>
    </div>
  </div>
</nav>

<header class="hero">
  <div class="wrap">
    <div class="hero-grid">
      <div class="hero-text">
        <div class="eyebrow"><span class="dot"></span>Mobile mechanic &middot; ${city}</div>
        <h1>
          Your<br>
          <span class="amber">Driveway</span><br>
          <span class="stroke">Is The</span><br>
          Shop.
        </h1>
        <p class="hero-sub">Honest, ASE-certified repairs at your home, office, or on the side of the road. Save the tow. Save the wait. We bring the garage to you &mdash; usually same-day.</p>
        <div class="hero-ctas">
          <button class="btn btn-amber btn-lg" data-book>Book a service <span class="arrow">&rarr;</span></button>
          ${phone ? `<a href="${telHref}" class="btn btn-ghost btn-lg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            ${phone}
          </a>` : ""}
        </div>
        <div class="hero-meta">
          <div><b>4.9&#x2605;</b>Verified reviews</div>
          <div><b>ASE</b>Certified</div>
          <div><b>60min</b>Avg response</div>
        </div>
      </div>
      <aside class="hero-photo">
        <span class="badge">&#9679; LIVE &middot; Mobile service active</span>
        <div class="ticker">
          <span>Now serving &middot; <span class="amb">${city.toUpperCase()}</span></span>
          <span>Book online or call</span>
        </div>
      </aside>
    </div>
  </div>
</header>

<div class="marquee" aria-hidden="true">
  <div class="marquee-track" id="marquee-track"></div>
</div>

<section class="block" id="services">
  <div class="wrap">
    <div class="section-head">
      <div>
        <div class="num">01 / Services</div>
        <h2>What we <span class="amber">fix</span> on your block.</h2>
      </div>
      <p>Flat-rate pricing for common jobs. Diagnostic-based jobs get a written quote before any wrench turns. Parts warranty included on every repair.</p>
    </div>
    <div class="services-grid" id="services-grid"></div>
  </div>
</section>

<section class="block" id="reviews">
  <div class="wrap">
    <div class="section-head">
      <div>
        <div class="num">02 / Reviews</div>
        <h2>Neighbors who <span class="amber">stopped</span> driving to a shop.</h2>
      </div>
      <p>Verified reviews from real customers. Honest repairs at your driveway.</p>
    </div>
    <div class="reviews-grid">
      <article class="review">
        <div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <blockquote><span class="pull">&ldquo;</span>Showed up in 40 minutes, replaced my battery and tested the alternator while I finished a meeting. No tow, no lost half-day. This is how car repair should work.</blockquote>
        <div class="review-meta">
          <div class="av">D</div>
          <div><strong>Danielle R.</strong><small>${city} &middot; Honda Civic</small></div>
        </div>
      </article>
      <article class="review">
        <div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <blockquote><span class="pull">&ldquo;</span>Quoted me half what the dealer wanted on rear brakes. Brought the parts, did it in my driveway, walked me through what was actually worn. Honest. I won&rsquo;t go to a shop again.</blockquote>
        <div class="review-meta">
          <div class="av">M</div>
          <div><strong>Marcus T.</strong><small>${city} &middot; Toyota Tacoma</small></div>
        </div>
      </article>
      <article class="review">
        <div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
        <blockquote><span class="pull">&ldquo;</span>Check engine light on the morning of a long drive. Was at my place by 9am, fixed the sensor, sent a written report. Was on the road by lunch. Worth every penny.</blockquote>
        <div class="review-meta">
          <div class="av">A</div>
          <div><strong>Aisha N.</strong><small>${city} &middot; Subaru Outback</small></div>
        </div>
      </article>
    </div>
  </div>
</section>

<section class="block" id="faq" style="background:var(--ink-2)">
  <div class="wrap">
    <div class="section-head" style="justify-content:center;text-align:center;flex-direction:column;align-items:center">
      <div class="num">03 / FAQ</div>
      <h2>Things you&rsquo;re probably <span class="amber">wondering</span>.</h2>
    </div>
    <div class="faq-wrap">
      <details class="qa" open>
        <summary>How does mobile mechanic service work? <span class="plus">+</span></summary>
        <p>You book a service or call us. We confirm, give you a written quote, and roll out with the right parts and tools. Most jobs are done in your driveway or lot in 30&ndash;120 minutes.</p>
      </details>
      <details class="qa">
        <summary>What repairs can you do on-site? <span class="plus">+</span></summary>
        <p>Most maintenance and many repairs: oil &amp; fluids, brakes, batteries, alternators, starters, diagnostics, AC service, tune-ups, and pre-purchase inspections. If a job needs a lift we&rsquo;ll tell you straight up.</p>
      </details>
      <details class="qa">
        <summary>Is mobile pricing more expensive than a shop? <span class="plus">+</span></summary>
        <p>Usually less. We don&rsquo;t carry the overhead of a building, so labor is more competitive. Same warranties and OEM-grade parts.</p>
      </details>
      <details class="qa">
        <summary>Do you warranty your work? <span class="plus">+</span></summary>
        <p>Yes &mdash; 12-month / 12,000-mile warranty on parts and labor for almost everything we install. Wear items carry their manufacturer warranty.</p>
      </details>
      <details class="qa">
        <summary>What payment do you accept? <span class="plus">+</span></summary>
        <p>Card, cash, Apple Pay, Google Pay, Zelle, and Venmo. Payment is taken when the job is done and you&rsquo;re satisfied.</p>
      </details>
    </div>
  </div>
</section>

<section class="cta-band">
  <div class="wrap row">
    <h2>Ready when<br>you are.</h2>
    <div class="actions">
      <button class="btn btn-ink btn-lg" data-book>Book a service <span class="arrow">&rarr;</span></button>
      ${phone ? `<a href="${telHref}" class="btn btn-line btn-lg">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        ${phone}
      </a>` : ""}
    </div>
  </div>
</section>

<footer id="contact">
  <div class="wrap foot-grid">
    <div>
      <div class="logo" style="margin-bottom:18px">
        <span class="logo-mark">${initial}</span>
        <span class="logo-text"><strong>${name}</strong><small>Mobile Mechanic &middot; ${city}</small></span>
      </div>
      <p style="color:var(--muted);max-width:300px;font-size:14px;line-height:1.55">${aboutBody}</p>
    </div>
    <div>
      <h4>Services</h4>
      <ul id="footer-services"></ul>
    </div>
    <div>
      <h4>Info</h4>
      <ul>
        <li><a href="#services">All services</a></li>
        <li><a href="#reviews">Reviews</a></li>
        <li><a href="#faq">FAQ</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </div>
    <div>
      <h4>Contact</h4>
      <ul>
        ${phone ? `<li><a href="${telHref}">${phone}</a></li>` : ""}
        ${email ? `<li><a href="mailto:${email}">${email}</a></li>` : ""}
        ${address ? `<li>${address}</li>` : ""}
      </ul>
    </div>
  </div>
  <div class="wrap foot-bottom">
    <span>${copyright}</span>
    <span>ASE Certified &middot; Fully Insured</span>
  </div>
</footer>

<div class="modal-back" id="modal-back" role="dialog" aria-modal="true">
  <div class="modal" id="modal">
    <div class="modal-head">
      <strong id="modal-title">Book a service</strong>
      <button class="close" data-close>&times;</button>
    </div>
    <div class="steps" id="steps">
      <div class="step active" data-s="1"><span class="n">1</span>Service</div>
      <div class="step" data-s="2"><span class="n">2</span>Date</div>
      <div class="step" data-s="3"><span class="n">3</span>Vehicle</div>
      <div class="step" data-s="4"><span class="n">4</span>Contact</div>
      <div class="step" data-s="5"><span class="n">5</span>Confirm</div>
    </div>
    <div class="modal-body" id="modal-body"></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="back-btn" disabled>&larr; Back</button>
      <button class="btn btn-amber" id="next-btn">Continue &rarr;</button>
    </div>
  </div>
</div>

<script>
const SERVICES = ${servicesJson};

// Marquee
const track = document.getElementById('marquee-track');
const items = SERVICES.map(s => s.title);
const doubled = [...items, ...items];
track.innerHTML = '<span>' + doubled.map((t,i) => t + (i < doubled.length - 1 ? ' <i class="sep"></i> ' : '')).join('') + '</span>';

// Services grid
const grid = document.getElementById('services-grid');
SERVICES.forEach(s => {
  const el = document.createElement('div');
  el.className = 'svc';
  el.innerHTML = \`
    <div class="svc-num">\${s.n} / Service</div>
    <h3>\${s.title}</h3>
    <p>\${s.blurb}</p>
    <div class="svc-foot">
      <div class="svc-price"><small>From</small>\${s.from} <span style="font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.1em">\${s.unit}</span></div>
      <button class="svc-book" data-book data-svc="\${s.title}">Book <span>&rarr;</span></button>
    </div>
  \`;
  grid.appendChild(el);
});

// Footer services list (first 5)
const footerSvcs = document.getElementById('footer-services');
SERVICES.slice(0, 5).forEach(s => {
  const li = document.createElement('li');
  li.innerHTML = \`<a href="#services">\${s.title}</a>\`;
  footerSvcs.appendChild(li);
});
const more = document.createElement('li');
more.innerHTML = '<a href="#services">All services &rarr;</a>';
footerSvcs.appendChild(more);

// Booking flow
const state = {step:1,service:null,servicePrice:'',date:null,time:null,monthOffset:0,year:'',make:'',model:'',miles:'',name:'',phone:'',address:'',notes:''};
const backBtn = document.getElementById('back-btn');
const nextBtn = document.getElementById('next-btn');
const bodyEl  = document.getElementById('modal-body');
const stepsEl = document.getElementById('steps');
const modalBack = document.getElementById('modal-back');
function openModal(preselect){state.step=1;if(preselect){const found=SERVICES.find(s=>s.title===preselect);state.service=preselect;state.servicePrice=found?found.from:'';}modalBack.classList.add('open');render();}
function closeModal(){modalBack.classList.remove('open');setTimeout(()=>{Object.assign(state,{step:1,service:null,servicePrice:'',date:null,time:null,year:'',make:'',model:'',miles:'',name:'',phone:'',address:'',notes:''});},300);}
document.querySelectorAll('[data-book]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.svc)));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModal));
modalBack.addEventListener('click',e=>{if(e.target===modalBack)closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
function setStep(n){if(n<1)n=1;if(n>6)n=6;state.step=n;render();}
backBtn.addEventListener('click',()=>setStep(state.step-1));
nextBtn.addEventListener('click',()=>{if(!canAdvance())return;setStep(state.step===5?6:state.step+1);});
function canAdvance(){if(state.step===1)return!!state.service;if(state.step===2)return!!state.date&&!!state.time;if(state.step===3)return state.year&&state.make&&state.model;if(state.step===4)return state.name&&state.phone&&state.address;return true;}
function updateFoot(){if(state.step===6){backBtn.style.display='none';nextBtn.textContent='Close';nextBtn.onclick=()=>{closeModal();nextBtn.onclick=null;};}else{backBtn.style.display='';backBtn.disabled=state.step===1;nextBtn.disabled=!canAdvance();nextBtn.textContent=state.step===5?'Confirm booking →':'Continue →';nextBtn.onclick=()=>{if(!canAdvance())return;setStep(state.step===5?6:state.step+1);};}[...stepsEl.children].forEach((el,i)=>{el.classList.remove('active','done');const n=i+1;if(state.step===6||n<state.step)el.classList.add('done');else if(n===state.step)el.classList.add('active');});}
function render(){if(state.step===1)renderService();else if(state.step===2)renderDate();else if(state.step===3)renderVehicle();else if(state.step===4)renderContact();else if(state.step===5)renderConfirm();else if(state.step===6)renderDone();updateFoot();}
function renderService(){bodyEl.classList.remove('center');bodyEl.innerHTML=\`<h3>What needs work?</h3><p class="lead">Pick the closest match. You can add notes later.</p><div class="pick-grid">\${SERVICES.map(s=>\`<button class="pick \${state.service===s.title?'sel':''}" data-svc-pick="\${s.title}" data-price="\${s.from}"><span><strong>\${s.title}</strong><small>From \${s.from} \${s.unit}</small></span><span class="pp">\${s.from}</span></button>\`).join('')}</div>\`;bodyEl.querySelectorAll('[data-svc-pick]').forEach(b=>b.addEventListener('click',()=>{state.service=b.dataset.svcPick;state.servicePrice=b.dataset.price;render();}));}
function renderDate(){bodyEl.classList.remove('center');const today=new Date();const base=new Date(today.getFullYear(),today.getMonth()+state.monthOffset,1);const monthName=base.toLocaleString('en-US',{month:'long',year:'numeric'}).toUpperCase();const startDow=base.getDay();const daysInMonth=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();const dayCells=[];for(let i=0;i<startDow;i++)dayCells.push('<div></div>');for(let d=1;d<=daysInMonth;d++){const dt=new Date(base.getFullYear(),base.getMonth(),d);const iso=dt.toISOString().slice(0,10);const past=dt<new Date(today.getFullYear(),today.getMonth(),today.getDate());const isSun=dt.getDay()===0;const disabled=past||isSun;const isToday=iso===today.toISOString().slice(0,10);const isSel=state.date===iso;dayCells.push(\`<div class="cal-day \${disabled?'disabled':''} \${isSel?'sel':''} \${isToday?'today':''}" data-day="\${disabled?'':iso}">\${d}</div>\`);}const slots=['7:00 AM','8:30 AM','10:00 AM','11:30 AM','1:00 PM','2:30 PM','4:00 PM','5:30 PM'];bodyEl.innerHTML=\`<h3>When works for you?</h3><p class="lead">We confirm within an hour. Sundays we're closed.</p><div class="month-nav"><button id="prev-month">←</button><strong>\${monthName}</strong><button id="next-month">→</button></div><div class="cal-head"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div><div class="calendar">\${dayCells.join('')}</div><div style="font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:24px 0 10px">Pick a time window</div><div class="slots">\${slots.map(t=>\`<button class="slot \${state.time===t?'sel':''}" data-slot="\${t}">\${t}</button>\`).join('')}</div>\`;bodyEl.querySelector('#prev-month').addEventListener('click',()=>{if(state.monthOffset>0){state.monthOffset--;render();}});bodyEl.querySelector('#next-month').addEventListener('click',()=>{if(state.monthOffset<3){state.monthOffset++;render();}});bodyEl.querySelectorAll('[data-day]').forEach(d=>d.addEventListener('click',()=>{if(d.dataset.day){state.date=d.dataset.day;render();}}));bodyEl.querySelectorAll('[data-slot]').forEach(s=>s.addEventListener('click',()=>{state.time=s.dataset.slot;render();}));}
function renderVehicle(){bodyEl.classList.remove('center');bodyEl.innerHTML=\`<h3>Tell us about the car.</h3><p class="lead">Year, make, model &mdash; we'll bring the right parts.</p><div class="field-row"><div class="field"><label>Year</label><input id="f-year" type="text" placeholder="2018" value="\${state.year}"></div><div class="field"><label>Mileage (approx)</label><input id="f-miles" type="text" placeholder="85,000" value="\${state.miles}"></div></div><div class="field-row"><div class="field"><label>Make</label><select id="f-make"><option value="">Select&hellip;</option>\${['Acura','Audi','BMW','Buick','Cadillac','Chevrolet','Chrysler','Dodge','Ford','GMC','Honda','Hyundai','Jeep','Kia','Lexus','Mazda','Mercedes-Benz','Nissan','Ram','Subaru','Toyota','Volkswagen','Volvo','Other'].map(m=>\`<option \${state.make===m?'selected':''}>\${m}</option>\`).join('')}</select></div><div class="field"><label>Model</label><input id="f-model" type="text" placeholder="Civic" value="\${state.model}"></div></div><div class="field"><label>Anything else? (optional)</label><input id="f-notes" type="text" placeholder="Pulling left when I brake" value="\${state.notes}"></div>\`;bodyEl.querySelector('#f-year').addEventListener('input',e=>{state.year=e.target.value;updateFoot();});bodyEl.querySelector('#f-miles').addEventListener('input',e=>{state.miles=e.target.value;});bodyEl.querySelector('#f-make').addEventListener('change',e=>{state.make=e.target.value;updateFoot();});bodyEl.querySelector('#f-model').addEventListener('input',e=>{state.model=e.target.value;updateFoot();});bodyEl.querySelector('#f-notes').addEventListener('input',e=>{state.notes=e.target.value;});}
function renderContact(){bodyEl.classList.remove('center');bodyEl.innerHTML=\`<h3>Where should we meet you?</h3><p class="lead">We'll text the day before and call when we're ~15 minutes out.</p><div class="field-row"><div class="field"><label>Your name</label><input id="f-name" type="text" placeholder="First &amp; last" value="\${state.name}"></div><div class="field"><label>Mobile phone</label><input id="f-phone" type="tel" placeholder="(555) 555-0123" value="\${state.phone}"></div></div><div class="field"><label>Service address</label><input id="f-address" type="text" placeholder="123 Main St" value="\${state.address}"></div>\`;bodyEl.querySelector('#f-name').addEventListener('input',e=>{state.name=e.target.value;updateFoot();});bodyEl.querySelector('#f-phone').addEventListener('input',e=>{state.phone=e.target.value;updateFoot();});bodyEl.querySelector('#f-address').addEventListener('input',e=>{state.address=e.target.value;updateFoot();});}
function renderConfirm(){bodyEl.classList.remove('center');const dt=state.date?new Date(state.date+'T12:00:00'):null;const dateStr=dt?dt.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}):'';bodyEl.innerHTML=\`<h3>Look right?</h3><p class="lead">Confirm to lock it in. You'll get a text confirmation within an hour.</p><div class="summary-card"><div class="row"><span>Service</span><span>\${state.service||'&mdash;'}</span></div><div class="row"><span>When</span><span>\${dateStr} &middot; \${state.time||''}</span></div><div class="row"><span>Vehicle</span><span>\${state.year} \${state.make} \${state.model}</span></div><div class="row"><span>Address</span><span style="text-align:right;max-width:60%">\${state.address}</span></div><div class="row"><span>Contact</span><span>\${state.name} &middot; \${state.phone}</span></div><div class="row"><span>Estimate from</span><span>\${state.servicePrice}</span></div></div>\`;}
function renderDone(){bodyEl.classList.add('center');const dt=state.date?new Date(state.date+'T12:00:00'):null;const dateStr=dt?dt.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}):'';bodyEl.innerHTML=\`<div class="check-ok"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><h3 style="text-align:center">You're booked.</h3><p class="lead" style="text-align:center;margin-bottom:24px">\${state.service} &middot; \${dateStr} &middot; \${state.time}<br>Confirmation #\${Math.floor(10000+Math.random()*89999)} sent to \${state.phone}.</p><small style="font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase">We'll be in touch shortly.</small>\`;}
render();
</script>
</body>
</html>`;
}

function buildHtml(title: string, content: WebsiteContent, template: string): string {
  if (template === "mechanic") return buildKabaHtml(title, content);

  const accentColor = getAccentColor(template);
  const services = content.services.map((s) =>
    `<div class="service-card"><h3>${s.title}</h3><p>${s.description}</p></div>`
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #222; }
  .hero { background: ${accentColor}; color: #fff; padding: 80px 24px; text-align: center; }
  .hero h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 16px; }
  .hero p { font-size: 1.1rem; opacity: 0.85; margin-bottom: 32px; }
  .hero a { display: inline-block; background: #fff; color: ${accentColor}; padding: 14px 32px; border-radius: 6px; font-weight: 600; text-decoration: none; }
  section { padding: 60px 24px; max-width: 900px; margin: 0 auto; }
  h2 { font-size: 1.8rem; font-weight: 700; margin-bottom: 16px; }
  p { font-size: 1rem; line-height: 1.7; color: #444; }
  .services { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 32px; }
  .service-card { background: #f8f9fa; border-radius: 8px; padding: 24px; }
  .service-card h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 8px; }
  .contact-info { margin-top: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 1rem; }
  footer { background: #222; color: #aaa; text-align: center; padding: 24px; font-size: 0.9rem; }
</style>
</head>
<body>
<div class="hero">
  <h1>${content.hero.title}</h1>
  <p>${content.hero.tagline}</p>
  <a href="#contact">${content.hero.cta}</a>
</div>
<section>
  <h2>${content.about.heading}</h2>
  <p>${content.about.body}</p>
</section>
<section style="background:#f8f9fa; max-width:100%; padding: 60px 24px;">
  <div style="max-width:900px; margin:0 auto">
    <h2>Our Services</h2>
    <div class="services">${services}</div>
  </div>
</section>
<section id="contact">
  <h2>Contact Us</h2>
  <div class="contact-info">
    ${content.contact.phone ? `<div>📞 ${content.contact.phone}</div>` : ""}
    ${content.contact.email ? `<div>✉️ ${content.contact.email}</div>` : ""}
    ${content.contact.address ? `<div>📍 ${content.contact.address}</div>` : ""}
  </div>
</section>
<footer>${content.footer.tagline}</footer>
</body>
</html>`;
}

export function WebsiteGeneratorDialog({ open, onClose, leadId, leadName }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [website, setWebsite] = useState<GeneratedWebsite | null>(null);
  const [editContent, setEditContent] = useState<WebsiteContent | null>(null);
  const [copied, setCopied] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generate = (trpc.websites.generate as any).useMutation({
    onSuccess: (data: GeneratedWebsite) => {
      setWebsite(data);
      setEditContent(data.content as unknown as WebsiteContent);
      setStep("edit");
    },
    onError: () => {
      toast.error("Failed to generate website.");
      setStep("choose");
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateWebsite = (trpc.websites.update as any).useMutation({
    onSuccess: (data: GeneratedWebsite) => {
      setWebsite(data);
      toast.success("Website saved.");
    },
    onError: () => toast.error("Failed to save changes."),
  });

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setStep("generating");
    generate.mutate({ leadId, template });
  };

  const handleSave = () => {
    if (!website || !editContent) return;
    updateWebsite.mutate({ id: website.id, content: editContent });
  };

  const handleCopyHtml = () => {
    if (!website || !editContent) return;
    const html = buildHtml(website.title, editContent, website.template);
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleClose = () => {
    setStep("choose");
    setSelectedTemplate(null);
    setWebsite(null);
    setEditContent(null);
    onClose();
  };

  const updateSection = <K extends keyof WebsiteContent>(section: K, patch: Partial<WebsiteContent[K]>) => {
    setEditContent((prev) => prev ? { ...prev, [section]: { ...(prev[section] as object), ...patch } } : null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent style={{ maxWidth: step === "edit" ? 720 : 520, maxHeight: "90vh", overflow: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Globe size={18} />
            Website Generator
            {leadName && <span style={{ fontWeight: 400, color: "var(--crm-fg-faint)", fontSize: 14 }}>· {leadName}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose template */}
        {step === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            <p style={{ fontSize: 13, color: "var(--crm-fg-faint)" }}>
              Choose a template and we&apos;ll fill it with {leadName}&apos;s real information.
            </p>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelectTemplate(t.id)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--crm-border)",
                  background: "var(--crm-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--crm-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--crm-surface)")}
              >
                <span style={{ fontSize: 28, lineHeight: 1 }}>{t.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "var(--crm-fg-faint)", lineHeight: 1.5 }}>{t.description}</div>
                </div>
                <ChevronRight size={16} style={{ color: "var(--crm-fg-faint)", marginTop: 4, flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Generating */}
        {step === "generating" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "40px 0" }}>
            <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "var(--crm-accent)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Generating website…</div>
              <div style={{ fontSize: 13, color: "var(--crm-fg-faint)", marginTop: 4 }}>
                Filling {TEMPLATES.find((t) => t.id === selectedTemplate)?.name} with {leadName}&apos;s data
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Edit */}
        {step === "edit" && editContent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Pencil size={14} style={{ color: "var(--crm-fg-faint)" }} />
              <span style={{ fontSize: 13, color: "var(--crm-fg-faint)" }}>
                Edit content below, then save or copy the HTML
              </span>
            </div>

            {/* Hero section */}
            <fieldset style={{ border: "1px solid var(--crm-border)", borderRadius: 8, padding: 14 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, padding: "0 6px", color: "var(--crm-fg-faint)" }}>Hero</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Title</label>
                  <input
                    className="crm-input"
                    style={{ width: "100%", marginTop: 2 }}
                    value={editContent.hero.title}
                    onChange={(e) => updateSection("hero", { title: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Tagline</label>
                  <input
                    className="crm-input"
                    style={{ width: "100%", marginTop: 2 }}
                    value={editContent.hero.tagline}
                    onChange={(e) => updateSection("hero", { tagline: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>CTA Button</label>
                  <input
                    className="crm-input"
                    style={{ width: "100%", marginTop: 2 }}
                    value={editContent.hero.cta}
                    onChange={(e) => updateSection("hero", { cta: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>

            {/* About section */}
            <fieldset style={{ border: "1px solid var(--crm-border)", borderRadius: 8, padding: 14 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, padding: "0 6px", color: "var(--crm-fg-faint)" }}>About</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Heading</label>
                  <input
                    className="crm-input"
                    style={{ width: "100%", marginTop: 2 }}
                    value={editContent.about.heading}
                    onChange={(e) => updateSection("about", { heading: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Body text</label>
                  <textarea
                    className="crm-input"
                    style={{ width: "100%", marginTop: 2, minHeight: 80, resize: "vertical" }}
                    value={editContent.about.body}
                    onChange={(e) => updateSection("about", { body: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>

            {/* Services section */}
            <fieldset style={{ border: "1px solid var(--crm-border)", borderRadius: 8, padding: 14 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, padding: "0 6px", color: "var(--crm-fg-faint)" }}>Services</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {editContent.services.map((service, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                    <input
                      className="crm-input"
                      placeholder="Service name"
                      value={service.title}
                      onChange={(e) => {
                        const updated = [...editContent.services];
                        updated[idx] = { ...updated[idx], title: e.target.value };
                        setEditContent((prev) => prev ? { ...prev, services: updated } : null);
                      }}
                    />
                    <input
                      className="crm-input"
                      placeholder="Description"
                      value={service.description}
                      onChange={(e) => {
                        const updated = [...editContent.services];
                        updated[idx] = { ...updated[idx], description: e.target.value };
                        setEditContent((prev) => prev ? { ...prev, services: updated } : null);
                      }}
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            {/* Contact section */}
            <fieldset style={{ border: "1px solid var(--crm-border)", borderRadius: 8, padding: 14 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, padding: "0 6px", color: "var(--crm-fg-faint)" }}>Contact</legend>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Phone</label>
                    <input
                      className="crm-input"
                      style={{ width: "100%", marginTop: 2 }}
                      value={editContent.contact.phone}
                      onChange={(e) => updateSection("contact", { phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Email</label>
                    <input
                      className="crm-input"
                      style={{ width: "100%", marginTop: 2 }}
                      value={editContent.contact.email}
                      onChange={(e) => updateSection("contact", { email: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--crm-fg-faint)" }}>Address / City</label>
                  <input
                    className="crm-input"
                    style={{ width: "100%", marginTop: 2 }}
                    value={editContent.contact.address}
                    onChange={(e) => updateSection("contact", { address: e.target.value })}
                  />
                </div>
              </div>
            </fieldset>

            {/* Footer */}
            <fieldset style={{ border: "1px solid var(--crm-border)", borderRadius: 8, padding: 14 }}>
              <legend style={{ fontSize: 12, fontWeight: 600, padding: "0 6px", color: "var(--crm-fg-faint)" }}>Footer</legend>
              <input
                className="crm-input"
                style={{ width: "100%" }}
                value={editContent.footer.tagline}
                onChange={(e) => updateSection("footer", { tagline: e.target.value })}
              />
            </fieldset>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="crm-btn ghost"
                style={{ fontSize: 13 }}
                onClick={() => setStep("choose")}
              >
                ← Change template
              </button>
              <button
                className="crm-btn ghost"
                style={{ fontSize: 13 }}
                onClick={handleCopyHtml}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy HTML"}
              </button>
              <button
                className="crm-btn"
                style={{ fontSize: 13 }}
                onClick={handleSave}
                disabled={updateWebsite.isPending}
              >
                {updateWebsite.isPending ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : null}
                Save
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
