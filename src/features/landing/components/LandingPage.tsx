"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowUpRight,
  Check,
  Columns,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Users,
} from "lucide-react";

const FEATURES = [
  {
    icon: MapPin,
    title: "Lead Scraper",
    description:
      "Generate fresh leads straight from Google Maps. Pick a category and location, and import enriched business contacts in minutes.",
  },
  {
    icon: Sparkles,
    title: "AI Qualification & Outreach",
    description:
      "AI scores every lead, drafts personalized outreach emails, and even spins up a demo website for each prospect — ready for your review.",
  },
  {
    icon: Phone,
    title: "Built-in Dialer",
    description:
      "Call leads right from the browser with the Twilio-powered dialer. Every call is logged against the lead automatically.",
  },
  {
    icon: Columns,
    title: "Pipeline Board",
    description:
      "Drag deals through customizable stages and always know exactly where every opportunity stands.",
  },
  {
    icon: Users,
    title: "Team Management",
    description:
      "Invite your team, assign leads, and scope visibility by role — admins see everything, reps stay focused on their own book.",
  },
  {
    icon: Mail,
    title: "Email Tracking",
    description:
      "Send CAN-SPAM-compliant outreach with open and click tracking, delivery webhooks, and one-click unsubscribe handling.",
  },
];

const STEPS = [
  {
    title: "Scrape & import leads",
    description:
      "Point the scraper at any niche and city, or bulk-import your existing list. Leads land deduplicated with phone, email, and website.",
  },
  {
    title: "AI qualifies and drafts outreach",
    description:
      "The outreach pipeline scores each lead, writes a tailored email, and generates a demo site — queued up for your approval, never auto-sent.",
  },
  {
    title: "Dial, track, and close",
    description:
      "Work the queue with the dialer, log outcomes, schedule follow-up tasks, and watch deals move across the pipeline board.",
  },
];

const PLANS = [
  {
    name: "Starter",
    tagline: "For solo founders getting off the ground",
    features: [
      "Up to 3 team seats",
      "Lead scraping & CSV import",
      "AI qualification & email drafts",
      "Browser dialer & call logging",
      "25 lead tags",
    ],
    highlighted: false,
  },
  {
    name: "Pro",
    tagline: "For growing sales teams",
    features: [
      "Up to 10 team seats",
      "Larger scraper runs (50 locations, 200 records)",
      "Automated outreach queue",
      "Pipeline board & analytics",
      "100 lead tags",
    ],
    highlighted: true,
  },
  {
    name: "Business",
    tagline: "For teams that need room to scale",
    features: [
      "Up to 50 team seats",
      "Everything in Pro",
      "Team roles & lead scoping",
      "Email tracking & webhooks",
      "500 lead tags",
    ],
    highlighted: false,
  },
];

const FAQS = [
  {
    q: "Do I own my data?",
    a: "Yes. ClientCore is open source (MIT) and can be fully self-hosted with Docker on your own infrastructure — your leads, calls, and emails stay in your own PostgreSQL database.",
  },
  {
    q: "Where do the leads come from?",
    a: "The built-in scraper pulls business listings from Google Maps for any category and location you choose, complete with phone numbers, websites, and emails where available. You can also bulk-import your existing lists via CSV.",
  },
  {
    q: "Does the AI send emails on its own?",
    a: "No. The AI drafts outreach emails and demo websites into a review queue — a human always approves before anything is sent. All outreach includes unsubscribe links and your physical address for CAN-SPAM compliance.",
  },
  {
    q: "Can I call leads without leaving the app?",
    a: "Yes. Connect a Twilio account and the browser dialer lets you place calls directly from a lead's record, with outcomes and notes logged automatically.",
  },
  {
    q: "How do team roles work?",
    a: "Admins see the whole organization, managers see their team's leads, and reps see only their own assignments — so everyone works a clean, focused queue.",
  },
  {
    q: "How does the free trial work?",
    a: "Every new organization starts with a 14-day free trial with full access. Pick a plan whenever you're ready.",
  },
];

function BrandMark({ size = "h-8 w-8 text-base" }: { size?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] font-black text-white ${size}`}
      aria-hidden="true"
    >
      C
    </span>
  );
}

function NavCtas() {
  const { status } = useSession();

  if (status === "authenticated") {
    return (
      <Link
        href="/dashboard"
        className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Go to dashboard
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/auth/signin"
        className="inline-flex h-9 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-white/80 transition-colors hover:text-white sm:px-4"
      >
        Sign in
      </Link>
      <Link
        href="/auth/register"
        className="inline-flex h-9 items-center whitespace-nowrap rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:px-4"
      >
        Get started
      </Link>
    </>
  );
}

function DashboardMockup() {
  return (
    <div aria-hidden="true" className="relative mx-auto mt-16 max-w-5xl px-4 sm:px-6">
      <div className="absolute inset-x-8 -top-8 h-40 rounded-full bg-[#7C3AED]/25 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#100F2A] shadow-[0_40px_120px_-40px_rgba(124,58,237,0.45)]">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="ml-4 hidden h-6 flex-1 max-w-xs items-center rounded-md bg-white/5 px-3 text-[11px] text-white/40 sm:flex">
            app.clientcore.io/dashboard
          </span>
        </div>
        <div className="flex">
          {/* Sidebar */}
          <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-white/10 p-4 sm:flex">
            <div className="mb-3 flex items-center gap-2">
              <BrandMark size="h-6 w-6 text-xs" />
              <span className="text-xs font-semibold text-white/80">ClientCore</span>
            </div>
            {["Dashboard", "Leads", "Dialer", "Pipeline", "Tasks", "Analytics"].map((item, i) => (
              <div
                key={item}
                className={`rounded-md px-3 py-1.5 text-[11px] ${
                  i === 0 ? "bg-[#7C3AED]/20 text-violet-300" : "text-white/40"
                }`}
              >
                {item}
              </div>
            ))}
          </div>
          {/* Main panel */}
          <div className="flex-1 space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total leads", value: "2,847", delta: "+12%" },
                { label: "Calls this week", value: "312", delta: "+8%" },
                { label: "Deals won", value: "41", delta: "+23%" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
                  <div className="text-[10px] text-white/40 sm:text-[11px]">{kpi.label}</div>
                  <div className="mt-1 text-lg font-semibold text-white sm:text-2xl">{kpi.value}</div>
                  <div className="mt-1 inline-block rounded-full bg-emerald-400/10 px-1.5 text-[10px] text-emerald-400">
                    {kpi.delta}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-3">
                <div className="mb-3 text-[11px] text-white/40">Pipeline value</div>
                <div className="flex h-24 items-end gap-2">
                  {[35, 55, 42, 70, 58, 85, 64, 92, 78, 100].map((h, i) => (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className="flex-1 rounded-t bg-gradient-to-t from-[#4F46E5] to-[#7C3AED] opacity-80"
                    />
                  ))}
                </div>
              </div>
              <div className="col-span-5 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                <div className="text-[11px] text-white/40">Hot leads</div>
                {["Summit Roofing", "Beacon Landscaping", "Delta Detailing"].map((name) => (
                  <div key={name} className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2">
                    <span className="text-[11px] text-white/70">{name}</span>
                    <span className="rounded-full bg-orange-400/10 px-1.5 text-[10px] text-orange-400">Hot</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen scroll-smooth bg-[#0B0A1E] text-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0A1E]/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-lg font-bold tracking-tight">ClientCore</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
          </div>
          <div className="flex items-center gap-2">
            <NavCtas />
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-20 pb-8 sm:pt-28">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.28),transparent_55%)]"
          />
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7C3AED]/50 bg-[#7C3AED]/15 px-4 py-1.5 text-sm font-medium text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              AI-powered CRM & lead automation
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              Automate Leads.
              <br />
              Close More Deals.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-violet-200/80">
              The all-in-one CRM platform to automate outreach, manage clients, and scale faster with AI.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/register"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-7 text-base font-semibold text-white shadow-[0_8px_30px_-8px_rgba(124,58,237,0.7)] transition-opacity hover:opacity-90"
              >
                Start for free
                <ArrowUpRight className="h-5 w-5" />
              </Link>
              <Link
                href="/auth/signin"
                className="inline-flex h-12 items-center rounded-xl border border-white/15 px-7 text-base font-medium text-white/90 transition-colors hover:bg-white/5"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-sm text-white/50">14-day free trial · Open source & self-hostable</p>
          </div>

          <DashboardMockup />
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Everything your sales team needs
              </h2>
              <p className="mt-4 text-lg text-white/60">
                From finding leads to closing deals — one workspace, no duct tape.
              </p>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-[#7C3AED]/40 hover:bg-white/[0.05]"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#7C3AED]/15 text-violet-300">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-white/10 bg-white/[0.02] py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                From cold list to closed deal
              </h2>
              <p className="mt-4 text-lg text-white/60">
                Three steps, mostly on autopilot.
              </p>
            </div>
            <div className="mt-14 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.title} className="relative">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] text-base font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Simple plans that grow with you
              </h2>
              <p className="mt-4 text-lg text-white/60">
                Every plan starts with a 14-day free trial. Prefer full control? Self-host it free forever.
              </p>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-2xl border p-7 ${
                    plan.highlighted
                      ? "border-[#7C3AED] bg-[#7C3AED]/10 shadow-[0_20px_60px_-20px_rgba(124,58,237,0.5)]"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-3 py-1 text-xs font-semibold text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-white/60">{plan.tagline}</p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-white/80">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/auth/register"
                    className={`mt-8 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 ${
                      plan.highlighted
                        ? "bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] text-white"
                        : "border border-white/15 text-white hover:bg-white/5"
                    }`}
                  >
                    Start free trial
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-white/10 bg-white/[0.02] py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Frequently asked questions
              </h2>
            </div>
            <div className="mt-12 space-y-3">
              {FAQS.map((faq) => (
                <details
                  key={faq.q}
                  className="group rounded-xl border border-white/10 bg-white/[0.03] open:border-[#7C3AED]/40"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-white/90 [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="text-lg text-white/40 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-white/60">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden py-20 sm:py-28">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(124,58,237,0.25),transparent_60%)]"
          />
          <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to fill your pipeline?
            </h2>
            <p className="mt-4 text-lg text-white/60">
              Create your workspace in under a minute — no credit card required.
            </p>
            <Link
              href="/auth/register"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-8 text-base font-semibold text-white shadow-[0_8px_30px_-8px_rgba(124,58,237,0.7)] transition-opacity hover:opacity-90"
            >
              Get started free
              <ArrowUpRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <BrandMark size="h-7 w-7 text-sm" />
              <span className="font-bold">ClientCore</span>
            </div>
            <p className="mt-3 text-sm text-white/50">
              The all-in-one CRM platform to automate outreach, manage clients, and scale faster with AI.
            </p>
          </div>
          <div className="flex gap-16 text-sm">
            <div className="flex flex-col gap-2.5">
              <span className="font-semibold text-white/80">Product</span>
              <a href="#features" className="text-white/50 transition-colors hover:text-white">Features</a>
              <a href="#how-it-works" className="text-white/50 transition-colors hover:text-white">How it works</a>
              <a href="#pricing" className="text-white/50 transition-colors hover:text-white">Pricing</a>
              <a href="#faq" className="text-white/50 transition-colors hover:text-white">FAQ</a>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="font-semibold text-white/80">Get started</span>
              <Link href="/auth/register" className="text-white/50 transition-colors hover:text-white">
                Create account
              </Link>
              <Link href="/auth/signin" className="text-white/50 transition-colors hover:text-white">
                Sign in
              </Link>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
          <p className="border-t border-white/10 pt-6 text-xs text-white/40">
            © {new Date().getFullYear()} ClientCore. Open source under the MIT license.
          </p>
        </div>
      </footer>
    </div>
  );
}
