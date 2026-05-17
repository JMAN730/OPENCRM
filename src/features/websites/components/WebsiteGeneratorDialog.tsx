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

function buildHtml(title: string, content: WebsiteContent, template: string): string {
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
