import type { DemoContent } from "@/lib/ai";

export type DemoExportSite = {
  title: string;
  businessName: string;
  phone: string | null;
  city: string | null;
  category: string | null;
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
  { source: "public/demo-template/workshop.jpg", target: "assets/workshop.jpg" },
  { source: "public/demo-template/shop-exterior.jpg", target: "assets/shop-exterior.jpg" },
] as const;

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

export function renderDemoHtml(site: DemoExportSite): string {
  const { content } = site;
  const businessName = site.businessName || site.title || "Demo Site";
  const specialty = site.category || "Local service";
  const serviceArea = site.city || "Local area";
  const photos = content.photos?.filter(Boolean) ?? [];
  const heroImage = attr(photos[0] ?? "assets/workshop.jpg");
  const shopImage = attr(photos[1] ?? photos[0] ?? "assets/shop-exterior.jpg");
  const telHref = site.phone ? `tel:${site.phone.replace(/[^0-9+]/g, "")}` : "#contact";
  const services = content.services.length > 0 ? content.services : [specialty];
  const headlineWords = splitHeadline(content.headline || businessName);
  const googleMapsUrl = content.googleMapsUrl;
  const mapQuery = `https://www.google.com/maps?q=${encodeURIComponent(`${businessName} ${site.city ?? ""}`)}&output=embed`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${text(site.title || businessName)}</title>
  <style>${DEMO_EXPORT_CSS}</style>
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
        <a href="#gallery">Shop</a>
        <a href="#reviews">Reviews</a>
        <a href="#contact">Visit</a>
      </div>
      <a class="pill red" href="${attr(telHref)}">${site.phone ? "Call Now" : text(content.cta)}</a>
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
              ${meta("Service", specialty)}
              ${meta("Area", serviceArea)}
              ${meta("Phone", site.phone ?? "Request a quote")}
            </div>
          </div>
          <div class="hero-copy">
            <p><strong>${text(businessName)}</strong> ${text(content.subheadline)}</p>
            <div class="actions">
              <a class="pill red" href="${attr(telHref)}">${text(content.cta)}</a>
              <a class="pill ghost" href="#services">View services</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="marquee">${[...services, ...services, ...services].map((item) => `<span>${text(item)} <i></i></span>`).join("")}</div>

    <section id="services" class="section">
      ${sectionHeader("/ 01 - SERVICES", "What we fix.", content.city_body_copy)}
      <div class="services">
        ${services.map((service, index) => `<article><b>/${String(index + 1).padStart(2, "0")}</b><em>↗</em><h3>${text(service)}</h3><p>Straightforward scheduling, clear communication, and work handled by a local team.</p></article>`).join("")}
      </div>
    </section>

    <section id="why" class="section dark split">
      <div class="photo-card"><img src="${shopImage}" alt=""><span>Inside the shop</span></div>
      <div>
        <p class="kicker">/ 02 - WHY US</p>
        <h2>Big-shop work.<br><span>Neighborhood</span><br>honesty.</h2>
        <p class="muted">${text(content.local_seo_headline)} ${text(content.city_body_copy)}</p>
        <div class="stats">
          ${stat("Local", "Service area")}
          ${stat("Clear", "Communication")}
          ${stat("Fast", "Customer contact")}
          ${stat("100%", "Demo ready")}
        </div>
      </div>
    </section>

    <section id="gallery" class="section dark">
      ${sectionHeader("/ 03 - THE SHOP", "Drop in. Look around.", "A visual-first section for shop photos, work examples, before-and-after projects, or team shots.", true)}
      <div class="gallery">
        <img class="wide" src="${shopImage}" alt="">
        <img src="${heroImage}" alt="">
        ${services.slice(0, 4).map((service) => `<div class="gallery-label">${text(service)}</div>`).join("")}
      </div>
    </section>

    ${content.testimonials.length > 0 ? `<section id="reviews" class="section reviews">
      <div class="review-head"><div><p class="kicker">/ 04 - WHAT FOLKS SAY</p><h2>Receipts.</h2></div><strong>5.0 <small>★★★★★<br>Demo reviews</small></strong></div>
      <div class="review-grid">${content.testimonials.map((testimonial) => `<figure><p>★★★★★</p><blockquote>&ldquo;${text(testimonial.quote)}&rdquo;</blockquote><figcaption>${text(testimonial.author)}<span>Local customer</span></figcaption></figure>`).join("")}</div>
    </section>` : ""}

    <section id="contact" class="section">
      ${sectionHeader("/ 05 - VISIT", "Find us. Book fast.", content.contact_body)}
      <div class="contact-grid">
        <div>
          ${contactBlock("Business", businessName, specialty)}
          ${contactBlock("Phone", site.phone ?? "Add phone number", "Fastest response during business hours.")}
          ${contactBlock("Area", serviceArea, content.contact_heading)}
        </div>
        <div class="map">
          ${googleMapsUrl ? `<iframe src="${attr(mapQuery)}" title="Business location" loading="lazy"></iframe>` : `<span>${text(businessName)}</span><i></i>`}
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="footer-grid">
      <div><img src="assets/logo.png" alt=""><h4>${text(businessName)}</h4><p>${text(specialty)} in ${text(serviceArea)}. Demo website, not an official site of this business.</p></div>
      ${footerLinks("Services", services.slice(0, 4))}
      ${footerLinks("Shop", ["About", "Gallery", "Reviews", "Contact"])}
      <div><h5>Contact</h5><a href="${attr(telHref)}">${text(site.phone ?? content.cta)}</a></div>
    </div>
    <div class="subfooter"><span>Demo website preview</span><span>${new Date().getFullYear()} · OpenCRM</span></div>
  </footer>
</body>
</html>`;
}

function splitHeadline(headline: string) {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 4) return words.length ? words : ["Demo", "Site"];
  const lines: string[] = [];
  for (let index = 0; index < words.length; index += 2) lines.push(words.slice(index, index + 2).join(" "));
  return lines.slice(0, 4);
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

const DEMO_EXPORT_CSS = `
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#faf7f0;color:#0b0d14;font-family:Manrope,Inter,Arial,sans-serif}a{color:inherit;text-decoration:none}.site-header{position:fixed;inset:0 0 auto;z-index:10;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(7,13,34,.9);color:#f4efe6;backdrop-filter:blur(10px)}.nav{max-width:1280px;margin:auto;padding:12px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand img,footer img{width:44px;height:44px;border-radius:50%;background:#f4efe6;padding:4px}.brand strong{display:block;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:20px;font-weight:900;font-style:italic;text-transform:uppercase}.brand small{display:block;margin-top:2px;color:#9ca3af;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.nav-links{display:flex;gap:28px;font-size:14px;font-weight:700}.pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:12px 20px;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.red{background:#b5172a;color:white}.ghost{border:1px solid rgba(255,255,255,.22);color:#f4efe6}.hero{position:relative;min-height:100vh;display:flex;align-items:flex-end;overflow:hidden;background:#070d22;color:#f4efe6;padding:120px 28px 56px}.hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:brightness(.36) contrast(1.25) saturate(1.1);transform:scale(1.08)}.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(7,13,34,.42),rgba(7,13,34,.16) 32%,rgba(7,13,34,.92) 88%)}.grid-overlay{position:absolute;inset:0;background-image:linear-gradient(rgba(244,239,230,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(244,239,230,.045) 1px,transparent 1px);background-size:56px 56px}.hero-inner{position:relative;z-index:1;width:min(1280px,100%);margin:auto}.status-row{display:flex;justify-content:space-between;gap:16px;margin-bottom:80px}.status-row span{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);border-radius:999px;padding:10px 16px;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:#9ca3af}.open{color:#f4efe6!important}.open i{display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:50%;background:#10b981;box-shadow:0 0 14px #10b981}.hero-grid{display:grid;grid-template-columns:1.55fr .9fr;align-items:end;gap:48px}.hero h1{margin:0;font-family:Impact,Arial Black,sans-serif;font-size:clamp(64px,12vw,152px);font-style:italic;line-height:.82;text-transform:uppercase}.hero h1 span{display:block}.hero-meta{display:flex;flex-wrap:wrap;gap:36px;margin-top:32px;padding-top:24px;border-top:1px solid rgba(255,255,255,.15)}.hero-meta p{margin:0 0 5px;color:#9ca3af;font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.hero-meta strong{font-family:Impact,Arial Black,sans-serif;font-size:28px;font-style:italic;text-transform:uppercase}.hero-copy{max-width:440px;margin-left:auto}.hero-copy p{font-size:17px;line-height:1.8;color:rgba(244,239,230,.82)}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.marquee{overflow:hidden;white-space:nowrap;background:#0b0d14;color:#f4efe6;padding:18px 0}.marquee span{display:inline-flex;align-items:center;gap:22px;margin-right:46px;font-family:Impact,Arial Black,sans-serif;font-size:32px;font-style:italic;text-transform:uppercase}.marquee i{width:10px;height:10px;border-radius:50%;background:#b5172a}.section{max-width:1280px;margin:auto;padding:96px 28px}.section.dark{max-width:none;background:#070d22;color:#f4efe6}.section.dark>*{max-width:1280px;margin-left:auto;margin-right:auto}.section-head{display:grid;grid-template-columns:auto 1fr;align-items:end;gap:40px;margin-bottom:52px}.kicker{margin:0 0 14px;color:#b5172a;font-size:12px;font-weight:900;letter-spacing:.22em;text-transform:uppercase}.section h2,.reviews h2{margin:0;font-family:Impact,Arial Black,sans-serif;font-size:clamp(48px,7vw,86px);font-style:italic;line-height:.9;text-transform:uppercase}.section-head>p{max-width:480px;justify-self:end;color:#6b7280;line-height:1.7}.section-head-dark>p{color:rgba(244,239,230,.65)}.services{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid rgba(0,0,0,.1);background:rgba(0,0,0,.1)}.services article{min-height:220px;background:#faf7f0;padding:28px;border:1px solid rgba(0,0,0,.05)}.services b{color:#6b7280;font-size:12px;letter-spacing:.2em}.services em{float:right;font-style:normal;font-size:22px}.services h3{margin:70px 0 12px;font-family:Impact,Arial Black,sans-serif;font-size:32px;font-style:italic;line-height:1;text-transform:uppercase}.services p,.muted{color:#6b7280;line-height:1.7}.split{display:grid!important;grid-template-columns:1fr 1fr;gap:56px;align-items:center}.photo-card{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:8px}.photo-card img,.gallery img{width:100%;height:100%;object-fit:cover}.photo-card span{position:absolute;left:24px;bottom:24px;background:#f4efe6;color:#0b0d14;border-radius:4px;padding:10px 14px;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.split h2 span{color:#b5172a}.stats{display:grid;grid-template-columns:1fr 1fr;margin-top:36px;border:1px solid rgba(255,255,255,.15)}.stats div{background:#070d22;padding:26px;border:1px solid rgba(255,255,255,.08)}.stats strong{display:block;color:#b5172a;font-family:Impact,Arial Black,sans-serif;font-size:50px;font-style:italic;text-transform:uppercase}.stats span{color:#9ca3af;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.gallery{display:grid!important;grid-template-columns:repeat(6,1fr);grid-auto-rows:120px;gap:16px}.gallery .wide{grid-column:span 3;grid-row:span 3}.gallery img:not(.wide){grid-column:span 3;grid-row:span 2}.gallery-label{display:flex;align-items:end;grid-column:span 3;min-height:120px;background:#1a1d26;padding:18px;color:#f4efe6;font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.reviews{background:#f4efe6}.review-head{display:flex;justify-content:space-between;align-items:end;gap:32px;margin-bottom:44px}.review-head strong{font-family:Impact,Arial Black,sans-serif;font-size:86px;font-style:italic;line-height:.8}.review-head small{font-family:Arial,sans-serif;font-size:12px;font-style:normal;color:#6b7280}.review-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.review-grid figure{margin:0;background:#faf7f0;border:1px solid rgba(0,0,0,.1);padding:28px}.review-grid figure p{color:#f59e0b}.review-grid blockquote{margin:18px 0;line-height:1.7}.review-grid figcaption{font-weight:900}.review-grid figcaption span{display:block;margin-top:4px;color:#6b7280;font-size:10px;letter-spacing:.14em;text-transform:uppercase}.contact-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:40px}.contact-block{background:white;border:1px solid rgba(0,0,0,.1);padding:26px;margin-bottom:18px}.contact-block p{margin:0;color:#b5172a;font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.contact-block strong{display:block;margin-top:12px;font-family:Impact,Arial Black,sans-serif;font-size:32px;font-style:italic;text-transform:uppercase}.contact-block span{display:block;margin-top:10px;color:#6b7280;line-height:1.6}.map{position:relative;min-height:420px;overflow:hidden;border-radius:8px;background:#0b0d14;background-image:linear-gradient(rgba(244,239,230,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,239,230,.05) 1px,transparent 1px);background-size:42px 42px}.map iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.map span{position:absolute;left:50%;top:45%;transform:translate(-50%,-100%);background:#f4efe6;color:#0b0d14;border-radius:4px;padding:10px 14px;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}.map i{position:absolute;left:50%;top:50%;width:18px;height:18px;transform:translate(-50%,-50%);border-radius:50%;background:#b5172a;box-shadow:0 0 0 10px rgba(181,23,42,.25),0 0 0 22px rgba(181,23,42,.12)}footer{background:#0b0d14;color:#f4efe6;padding:52px 28px}.footer-grid{max-width:1280px;margin:auto;display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:40px}footer h4{margin:10px 0;font-family:Impact,Arial Black,sans-serif;font-size:26px;font-style:italic;text-transform:uppercase}footer h5{margin:0 0 16px;color:#b5172a;font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}footer p,footer a{color:#9ca3af;line-height:1.7}footer ul{list-style:none;margin:0;padding:0}footer li{margin:8px 0}.subfooter{max-width:1280px;margin:0 auto;padding-top:22px;display:flex;justify-content:space-between;color:#9ca3af;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}@media(max-width:900px){.nav-links{display:none}.hero-grid,.split,.contact-grid,.section-head{grid-template-columns:1fr}.hero-copy,.section-head>p{margin-left:0;justify-self:start}.services,.review-grid{grid-template-columns:1fr}.gallery{grid-template-columns:1fr}.gallery .wide,.gallery img:not(.wide),.gallery-label{grid-column:span 1}.footer-grid{grid-template-columns:1fr 1fr}.hero{padding-left:20px;padding-right:20px}.section{padding:76px 20px}}@media(max-width:560px){.nav{padding:10px 16px}.brand strong{max-width:180px}.pill{padding:10px 14px}.status-row span:last-child{display:none}.hero-meta{gap:20px}.footer-grid,.stats{grid-template-columns:1fr}.subfooter{display:block}.review-head{display:block}.review-head strong{display:block;margin-top:20px;font-size:64px}}`;
