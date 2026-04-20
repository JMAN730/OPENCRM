"use client";

import { buttonVariants } from "@/components/ui/button";
import { Zap, BarChart3, Users, Phone, ArrowRight, TerminalSquare } from "lucide-react";

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="px-6 h-14 flex items-center border-b border-border/50 sticky top-0 z-50 bg-background/80 backdrop-blur">
        <Link href="#" className="flex items-center gap-2 font-semibold text-sm">
          <div className="w-6 h-6 bg-primary rounded flex items-center justify-center text-primary-foreground text-xs font-bold">C</div>
          OpenCRM
        </Link>
        <nav className="ml-auto flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
          <Link href="#self-host" className="hover:text-foreground transition-colors">Self-host</Link>
          <Link
            href="https://github.com"
            target="_blank"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <GithubIcon size={14} />
            GitHub
          </Link>
          <Link href="/auth/signin" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Sign in
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="flex flex-col items-center text-center px-6 pt-24 pb-20">
          <div className="inline-flex items-center gap-2 text-xs font-medium bg-muted px-3 py-1.5 rounded-full text-muted-foreground mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Open source · MIT license · Self-hostable
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight max-w-2xl leading-tight">
            A CRM that belongs<br />to you
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            No vendor lock-in. No per-seat pricing. Run it on your own infra,
            fork it, customize it — it&apos;s yours.
          </p>

          <div className="flex items-center gap-3 mt-10">
            <Link href="/auth/register" className={buttonVariants({ size: "lg", className: "gap-2" })}>
              Get started <ArrowRight size={16} />
            </Link>
            <Link href="https://github.com" className={buttonVariants({ size: "lg", variant: "outline", className: "gap-2" })}>
              <GithubIcon size={16} />
              View on GitHub
            </Link>
          </div>

          {/* Install snippet */}
          <div className="mt-12 flex items-center gap-3 bg-muted/60 border border-border/60 rounded-lg px-5 py-3 text-sm font-mono text-muted-foreground">
            <TerminalSquare size={14} />
            git clone https://github.com/your-org/opencrm
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border/50 px-6 py-20">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-10 text-center">What&apos;s included</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  icon: <Phone size={18} />,
                  title: "Smart Dialer",
                  desc: "Click-to-call and power dialer with automatic call logging.",
                },
                {
                  icon: <BarChart3 size={18} />,
                  title: "Analytics",
                  desc: "Call stats, lead conversion rates, and team performance dashboards.",
                },
                {
                  icon: <Users size={18} />,
                  title: "Lead Management",
                  desc: "Full pipeline with stages, filters, and bulk actions.",
                },
                {
                  icon: <Zap size={18} />,
                  title: "Outreach",
                  desc: "Email and SMS sequences with open and reply tracking.",
                },
              ].map((f) => (
                <div key={f.title} className="flex flex-col gap-3">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-foreground">
                    {f.icon}
                  </div>
                  <h3 className="font-semibold text-sm">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Self-host */}
        <section id="self-host" className="border-t border-border/50 px-6 py-20 bg-muted/30">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Own your data</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Deploy to any Postgres-compatible database. Works with Neon, Supabase,
              Railway, or your own server. One command to get started.
            </p>
            <div className="text-left bg-background border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs text-muted-foreground">
                <TerminalSquare size={12} />
                terminal
              </div>
              <div className="px-4 py-4 font-mono text-sm space-y-1">
                <p><span className="text-muted-foreground">$</span> git clone https://github.com/your-org/opencrm</p>
                <p><span className="text-muted-foreground">$</span> cp .env.example .env</p>
                <p><span className="text-muted-foreground">$</span> npx prisma db push</p>
                <p><span className="text-muted-foreground">$</span> npm run dev</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 px-6 py-8 flex flex-col sm:flex-row items-center gap-4 text-xs text-muted-foreground">
        <span>OpenCRM — MIT License</span>
        <div className="sm:ml-auto flex items-center gap-6">
          <Link href="https://github.com" target="_blank" className="hover:text-foreground transition-colors flex items-center gap-1.5">
            <GithubIcon size={12} />
            GitHub
          </Link>
          <Link href="#" className="hover:text-foreground transition-colors">Docs</Link>
          <Link href="#" className="hover:text-foreground transition-colors">License</Link>
        </div>
      </footer>
    </div>
  );
}
