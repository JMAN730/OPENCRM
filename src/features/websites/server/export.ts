import type { DemoContent } from "@/lib/ai";
import { buildDemoView, type DemoView } from "@/features/websites/demoView";
import type { PackTheme } from "@/features/websites/packs";

export type DemoExportSite = {
  title: string;
  businessName: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  content: DemoContent;
};

export type DemoExportFile = {
  path: string;
  data: Uint8Array;
};

export type DemoExport = {
  filename: string;
  files: DemoExportFile[];
};

const encoder = new TextEncoder();

export const DEMO_EXPORT_ASSETS = [
  { source: "public/demo-template/logo.png", target: "assets/logo.png" },
] as const;

/**
 * Local (public/) photos referenced by the site — pack fallback photos or
 * anything else served from this app. Remote URLs (Google Places) are left
 * as-is in the HTML and are not bundled.
 */
export function demoExportAssetSources(
  site: DemoExportSite,
): Array<{ source: string; target: string }> {
  const view = buildViewForExport(site);
  const seen = new Set<string>();
  const sources: Array<{ source: string; target: string }> = [
    ...DEMO_EXPORT_ASSETS.map((asset) => ({ ...asset })),
  ];
  for (const photo of view.photos) {
    if (!photo.startsWith("/")) continue;
    const target = localPhotoTarget(photo);
    if (seen.has(target)) continue;
    seen.add(target);
    sources.push({ source: `public${photo}`, target });
  }
  return sources;
}

export function buildDemoExport(site: DemoExportSite, assets: DemoExportFile[] = []): DemoExport {
  const filename = `${slugForFilename(site.businessName || site.title || "demo-site")}.zip`;
  const html = renderDemoHtml(site);

  return {
    filename,
    files: [
      { path: "index.html", data: encoder.encode(html) },
      ...assets,
    ],
  };
}

function buildViewForExport(site: DemoExportSite): DemoView {
  return buildDemoView({
    businessName: site.businessName || site.title,
    phone: site.phone,
    city: site.city,
    category: site.category,
    rating: site.rating,
    reviewCount: site.reviewCount,
    content: site.content,
  });
}

function localPhotoTarget(publicPath: string): string {
  const basename = publicPath.split("/").filter(Boolean).join("-");
  return `assets/${basename}`;
}

/** Rewrite public/ photo paths to their bundled asset targets. */
function photoSrc(photo: string | undefined): string | undefined {
  if (!photo) return undefined;
  return photo.startsWith("/") ? localPhotoTarget(photo) : photo;
}

export function renderDemoHtml(site: DemoExportSite): string {
  const view = buildViewForExport(site);
  const { businessName, specialty, serviceArea } = view;
  const photos = view.photos.map((photo) => photoSrc(photo)!).filter(Boolean);
  const heroImage = attr(photos[0] ?? "assets/demo-template-workshop.jpg");
  const shopImage = attr(photos[1] ?? photos[0] ?? "assets/demo-template-shop-exterior.jpg");
  const telHref = view.telHref ?? "#contact";
  const services = view.marqueeServices;
  const headlineWords = view.headlineLines;
  const googleMapsUrl = view.googleMapsUrl;
  const mapQuery = view.mapEmbedUrl;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${text(site.title || businessName)}</title>
  <style>${demoExportCss(view.theme)}</style>
</head>
<body>
  <header class="site-header">
    <nav class="nav">
      <a class="brand" href="#top">
        <img src="assets/logo.png" alt="">
        <span><strong>${text(businessName)}</strong><small>${text(specialty)} · ${text(serviceArea)}</small></span>
      </a>
      <div class="nav-links">
        <a href="#services">Services</a>
        <a href="#why">Why Us</a>
        <a href="#gallery">${text(view.galleryNavLabel)}</a>
        <a href="#reviews">Reviews</a>
        <a href="#contact">Visit</a>
      </div>
      <a class="pill red" href="${attr(telHref)}">${text(view.headerCta)}</a>
    </nav>
  </header>

  <main>
    <section id="top" class="hero">
      <div class="hero-bg" style="background-image:url('${heroImage}')"></div>
      <div class="grid-overlay"></div>
      <div class="hero-inner">
        <div class="status-row">
          <span class="open"><i></i>Open today</span>
          <span>${text(serviceArea)}</span>
        </div>
        <div class="hero-grid">
          <div>
            <h1>${headlineWords.map((word) => `<span>${text(word)}</span>`).join("")}</h1>
            <div class="hero-meta">
              ${view.heroMeta.map((item) => meta(item.label, item.value)).join("\n              ")}
            </div>
          </div>
          <div class="hero-copy">
            <p><strong>${text(businessName)}</strong> ${text(view.subheadline)}</p>
            <div class="actions">
              <a class="pill red" href="${attr(telHref)}">${text(view.cta)}</a>
              <a class="pill ghost" href="#services">${text(view.viewServicesLabel)}</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="marquee">${[...services, ...services, ...services].map((item) => `<span>${text(item)} <i></i></span>`).join("")}</div>

    <section id="services" class="section">
      ${sectionHeader(view.sections.services.kicker, view.sections.services.title, view.sections.services.body)}
      <div class="services">
        ${services.map((service, index) => `<article><b>/${String(index + 1).padStart(2, "0")}</b><em>↗</em><h3>${text(service)}</h3><p>${text(view.serviceCardBlurb)}</p></article>`).join("")}
      </div>
    </section>

    <section id="why" class="section dark split">
      <div class="photo-card"><img src="${shopImage}" alt=""><span>${text(view.whyPhotoCaption)}</span></div>
      <div>
        <p class="kicker">${text(view.sections.why.kicker)}</p>
        <h2>${view.sections.why.titleLines.map((line, index) => index === view.sections.why.accentLine ? `<span>${text(line)}</span>` : text(line)).join("<br>")}</h2>
        <p class="muted">${text(view.sections.why.body)}</p>
        <div class="stats">
          ${view.stats.map((item) => stat(item.value, item.label)).join("\n          ")}
        </div>
      </div>
    </section>

    <section id="gallery" class="section dark">
      ${sectionHeader(view.sections.gallery.kicker, view.sections.gallery.title, view.sections.gallery.body, true)}
      <div class="gallery">
        <img class="wide" src="${shopImage}" alt="">
        <img src="${heroImage}" alt="">
        ${services.slice(0, 4).map((service) => `<div class="gallery-label">${text(service)}</div>`).join("")}
      </div>
    </section>

    ${view.testimonials.length > 0 ? `<section id="reviews" class="section reviews">
      <div class="review-head"><div><p class="kicker">${text(view.sections.reviews.kicker)}</p><h2>${text(view.sections.reviews.title)}</h2></div><strong>${text(view.reviewsBadge.score)} <small>${text(view.reviewsBadge.stars)}<br>${text(view.reviewsBadge.note)}</small></strong></div>
      <div class="review-grid">${view.testimonials.map((testimonial) => `<figure><p>★★★★★</p><blockquote>&ldquo;${text(testimonial.quote)}&rdquo;</blockquote><figcaption>${text(testimonial.author)}<span>${text(view.reviewerLabel)}</span></figcaption></figure>`).join("")}</div>
    </section>` : ""}

    <section id="contact" class="section">
      ${sectionHeader(view.sections.contact.kicker, view.sections.contact.title, view.sections.contact.body)}
      <div class="contact-grid">
        <div>
          ${view.contactBlocks.map((block) => contactBlock(block.label, block.value, block.sub)).join("\n          ")}
        </div>
        <div class="map">
          ${googleMapsUrl ? `<iframe src="${attr(mapQuery)}" title="Business location" loading="lazy"></iframe>` : `<span>${text(businessName)}</span><i></i>`}
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="footer-grid">
      <div><img src="assets/logo.png" alt=""><h4>${text(businessName)}</h4><p>${text(view.footer.tagline)}</p></div>
      ${footerLinks("Services", view.footer.serviceLinks)}
      ${footerLinks("Explore", view.footer.shopLinks)}
      <div><h5>Contact</h5><a href="${attr(telHref)}">${text(view.footer.contactValue)}</a></div>
    </div>
    <div class="subfooter"><span>${text(view.footer.attribution)}</span><span>${text(view.footer.stamp)}</span></div>
  </footer>
</body>
</html>`;
}

function slugForFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "demo-site";
}

function text(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attr(value: string) {
  return text(value).replace(/"/g, "&quot;");
}

function meta(label: string, value: string) {
  return `<div><p>${text(label)}</p><strong>${text(value)}</strong></div>`;
}

function sectionHeader(number: string, title: string, body: string, dark = false) {
  return `<div class="section-head ${dark ? "section-head-dark" : ""}"><div><p class="kicker">${text(number)}</p><h2>${text(title)}</h2></div><p>${text(body)}</p></div>`;
}

function stat(value: string, label: string) {
  return `<div><strong>${text(value)}</strong><span>${text(label)}</span></div>`;
}

function contactBlock(label: string, value: string, sub: string) {
  return `<div class="contact-block"><p>${text(label)}</p><strong>${text(value)}</strong><span>${text(sub)}</span></div>`;
}

function footerLinks(title: string, items: string[]) {
  return `<div><h5>${text(title)}</h5><ul>${items.map((item) => `<li><a href="#services">${text(item)}</a></li>`).join("")}</ul></div>`;
}

function demoExportCss(t: PackTheme): string {
  return `
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:${t.paper};color:${t.ink};font-family:Manrope,Inter,Arial,sans-serif}a{color:inherit;text-decoration:none}.site-header{position:fixed;inset:0 0 auto;z-index:10;border-bottom:1px solid rgba(255,255,255,.1);background:color-mix(in srgb,${t.deep} 90%,transparent);color:${t.paperAlt};backdrop-filter:blur(10px)}.nav{max-width:1280px;margin:auto;padding:12px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand img,footer img{width:44px;height:44px;border-radius:50%;background:${t.paperAlt};padding:4px}.brand strong{display:block;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:20px;font-weight:900;font-style:italic;text-transform:uppercase}.brand small{display:block;margin-top:2px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.nav-links{display:flex;gap:28px;font-size:14px;font-weight:700}.pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:12px 20px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.red{background:${t.accent};color:white}.ghost{border:1px solid rgba(255,255,255,.22);color:${t.paperAlt}}.hero{position:relative;min-height:100vh;display:flex;align-items:flex-end;overflow:hidden;background:${t.deep};color:${t.paperAlt};padding:120px 28px 56px}.hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:brightness(.36) contrast(1.25) saturate(1.1);transform:scale(1.08)}.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,color-mix(in srgb,${t.deep} 42%,transparent),color-mix(in srgb,${t.deep} 16%,transparent) 32%,color-mix(in srgb,${t.deep} 92%,transparent) 88%)}.grid-overlay{position:absolute;inset:0;background-image:linear-gradient(rgba(244,239,230,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(244,239,230,.045) 1px,transparent 1px);background-size:56px 56px}.hero-inner{position:relative;z-index:1;width:min(1280px,100%);margin:auto}.status-row{display:flex;justify-content:space-between;gap:16px;margin-bottom:80px}.status-row span{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);border-radius:999px;padding:10px 16px;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:#9ca3af}.open{color:${t.paperAlt}!important}.open i{display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:50%;background:#10b981;box-shadow:0 0 14px #10b981}.hero-grid{display:grid;grid-template-columns:1.55fr .9fr;align-items:end;gap:48px}.hero h1{margin:0;font-family:Impact,Arial Black,sans-serif;font-size:clamp(64px,12vw,152px);font-style:italic;line-height:.82;text-transform:uppercase}.hero h1 span{display:block}.hero-meta{display:flex;flex-wrap:wrap;gap:36px;margin-top:32px;padding-top:24px;border-top:1px solid rgba(255,255,255,.15)}.hero-meta p{margin:0 0 5px;color:#9ca3af;font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.hero-meta strong{font-family:Impact,Arial Black,sans-serif;font-size:28px;font-style:italic;text-transform:uppercase}.hero-copy{max-width:440px;margin-left:auto}.hero-copy p{font-size:17px;line-height:1.8;color:color-mix(in srgb,${t.paperAlt} 82%,transparent)}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.marquee{overflow:hidden;white-space:nowrap;background:${t.ink};color:${t.paperAlt};padding:18px 0}.marquee span{display:inline-flex;align-items:center;gap:22px;margin-right:46px;font-family:Impact,Arial Black,sans-serif;font-size:32px;font-style:italic;text-transform:uppercase}.marquee i{width:10px;height:10px;border-radius:50%;background:${t.accent}}.section{max-width:1280px;margin:auto;padding:96px 28px}.section.dark{max-width:none;background:${t.deep};color:${t.paperAlt}}.section.dark>*{max-width:1280px;margin-left:auto;margin-right:auto}.section-head{display:grid;grid-template-columns:auto 1fr;align-items:end;gap:40px;margin-bottom:52px}.kicker{margin:0 0 14px;color:${t.accent};font-size:12px;font-weight:900;letter-spacing:.22em;text-transform:uppercase}.section h2,.reviews h2{margin:0;font-family:Impact,Arial Black,sans-serif;font-size:clamp(48px,7vw,86px);font-style:italic;line-height:.9;text-transform:uppercase}.section-head>p{max-width:480px;justify-self:end;color:#6b7280;line-height:1.7}.section-head-dark>p{color:color-mix(in srgb,${t.paperAlt} 65%,transparent)}.services{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid rgba(0,0,0,.1);background:rgba(0,0,0,.1)}.services article{min-height:220px;background:${t.paper};padding:28px;border:1px solid rgba(0,0,0,.05)}.services b{color:#6b7280;font-size:12px;letter-spacing:.2em}.services em{float:right;font-style:normal;font-size:22px}.services h3{margin:70px 0 12px;font-family:Impact,Arial Black,sans-serif;font-size:32px;font-style:italic;line-height:1;text-transform:uppercase}.services p,.muted{color:#6b7280;line-height:1.7}.split{display:grid!important;grid-template-columns:1fr 1fr;gap:56px;align-items:center}.photo-card{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:8px}.photo-card img,.gallery img{width:100%;height:100%;object-fit:cover}.photo-card span{position:absolute;left:24px;bottom:24px;background:${t.paperAlt};color:${t.ink};border-radius:4px;padding:10px 14px;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.split h2 span{color:${t.accent}}.stats{display:grid;grid-template-columns:1fr 1fr;margin-top:36px;border:1px solid rgba(255,255,255,.15)}.stats div{background:${t.deep};padding:26px;border:1px solid rgba(255,255,255,.08)}.stats strong{display:block;color:${t.accent};font-family:Impact,Arial Black,sans-serif;font-size:50px;font-style:italic;text-transform:uppercase}.stats span{color:#9ca3af;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.gallery{display:grid!important;grid-template-columns:repeat(6,1fr);grid-auto-rows:120px;gap:16px}.gallery .wide{grid-column:span 3;grid-row:span 3}.gallery img:not(.wide){grid-column:span 3;grid-row:span 2}.gallery-label{display:flex;align-items:end;grid-column:span 3;min-height:120px;background:#1a1d26;padding:18px;color:${t.paperAlt};font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.reviews{background:${t.paperAlt}}.review-head{display:flex;justify-content:space-between;align-items:end;gap:32px;margin-bottom:44px}.review-head strong{font-family:Impact,Arial Black,sans-serif;font-size:86px;font-style:italic;line-height:.8}.review-head small{font-family:Arial,sans-serif;font-size:12px;font-style:normal;color:#6b7280}.review-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.review-grid figure{margin:0;background:${t.paper};border:1px solid rgba(0,0,0,.1);padding:28px}.review-grid figure p{color:#f59e0b}.review-grid blockquote{margin:18px 0;line-height:1.7}.review-grid figcaption{font-weight:900}.review-grid figcaption span{display:block;margin-top:4px;color:#6b7280;font-size:10px;letter-spacing:.14em;text-transform:uppercase}.contact-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:40px}.contact-block{background:white;border:1px solid rgba(0,0,0,.1);padding:26px;margin-bottom:18px}.contact-block p{margin:0;color:${t.accent};font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.contact-block strong{display:block;margin-top:12px;font-family:Impact,Arial Black,sans-serif;font-size:32px;font-style:italic;text-transform:uppercase}.contact-block span{display:block;margin-top:10px;color:#6b7280;line-height:1.6}.map{position:relative;min-height:420px;overflow:hidden;border-radius:8px;background:${t.ink};background-image:linear-gradient(rgba(244,239,230,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,239,230,.05) 1px,transparent 1px);background-size:42px 42px}.map iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.map span{position:absolute;left:50%;top:45%;transform:translate(-50%,-100%);background:${t.paperAlt};color:${t.ink};border-radius:4px;padding:10px 14px;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}.map i{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);border-radius:50%;background:${t.accent};box-shadow:0 0 0 10px color-mix(in srgb,${t.accent} 25%,transparent),0 0 0 22px color-mix(in srgb,${t.accent} 12%,transparent)}footer{background:${t.ink};color:${t.paperAlt};padding:52px 28px}.footer-grid{max-width:1280px;margin:auto;display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:40px}footer h4{margin:10px 0;font-family:Impact,Arial Black,sans-serif;font-size:26px;font-style:italic;text-transform:uppercase}footer h5{margin:0 0 16px;color:${t.accent};font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}footer p,footer a{color:#9ca3af;line-height:1.7}footer ul{list-style:none;margin:0;padding:0}footer li{margin:8px 0}.subfooter{max-width:1280px;margin:0 auto;padding-top:22px;display:flex;justify-content:space-between;color:#9ca3af;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}@media(max-width:900px){.nav-links{display:none}.hero-grid,.split,.contact-grid,.section-head{grid-template-columns:1fr}.hero-copy,.section-head>p{margin-left:0;justify-self:start}.services,.review-grid{grid-template-columns:1fr}.gallery{grid-template-columns:1fr}.gallery .wide,.gallery img:not(.wide),.gallery-label{grid-column:span 1}.footer-grid{grid-template-columns:1fr 1fr}.hero{padding-left:20px;padding-right:20px}.section{padding:76px 20px}}@media(max-width:560px){.nav{padding:10px 16px}.brand strong{max-width:180px}.pill{padding:10px 14px}.status-row span:last-child{display:none}.hero-meta{gap:20px}.footer-grid,.stats{grid-template-columns:1fr}.subfooter{display:block}.review-head{display:block}.review-head strong{display:block;margin-top:20px;font-size:64px}}`;
}
