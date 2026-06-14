import type { DemoContent } from "@/lib/ai";

interface DemoTemplateProps {
  businessName: string;
  phone: string | null;
  city: string | null;
  category: string | null;
  content: DemoContent;
  photos?: string[];
  googleMapsUrl?: string;
}

const heroImage = "/demo-template/workshop.jpg";
const shopImage = "/demo-template/shop-exterior.jpg";
const logoImage = "/demo-template/logo.png";

export function DemoTemplate({
  businessName,
  phone,
  city,
  category,
  content,
  photos: photosProp,
  googleMapsUrl: googleMapsUrlProp,
}: DemoTemplateProps) {
  const photos = photosProp ?? content.photos ?? [];
  const googleMapsUrl = googleMapsUrlProp ?? content.googleMapsUrl;
  const telHref = phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : undefined;
  const specialty = category ?? "Local service";
  const serviceArea = city ?? "Local area";
  const heroWords = splitHeadline(content.headline);
  const marqueeItems = content.services.length > 0 ? content.services : [specialty];

  return (
    <div className="min-h-screen bg-[#faf7f0] text-[#0b0d14] [font-family:Manrope,system-ui,sans-serif]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#070d22]/88 px-5 py-3 text-[#f4efe6] backdrop-blur md:px-10">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href="#top" className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoImage}
              alt=""
              className="size-11 shrink-0 rounded-full bg-[#f4efe6] p-1"
            />
            <span className="min-w-0">
              <span className="block truncate text-xl font-black italic uppercase tracking-tight [font-family:'Arial_Narrow',Impact,sans-serif]">
                {businessName}
              </span>
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ca3af]">
                {specialty} · {serviceArea}
              </span>
            </span>
          </a>

          <div className="hidden items-center gap-8 text-sm font-semibold md:flex">
            <a href="#services" className="hover:text-white">Services</a>
            <a href="#why" className="hover:text-white">Why Us</a>
            <a href="#gallery" className="hover:text-white">Shop</a>
            <a href="#reviews" className="hover:text-white">Reviews</a>
            <a href="#contact" className="hover:text-white">Visit</a>
          </div>

          <a
            href={telHref ?? "#contact"}
            className="shrink-0 rounded-full bg-[#b5172a] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-red-950/30 hover:bg-[#8e0f1f]"
          >
            {phone ? "Call Now" : content.cta}
          </a>
        </nav>
      </header>

      <main>
        <section
          id="top"
          className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-[#070d22] px-5 pb-10 pt-32 text-[#f4efe6] md:px-10 md:pb-14"
        >
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center brightness-[.36] contrast-125 saturate-110"
            style={{ backgroundImage: `url(${photos[0] ?? heroImage})` }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,13,34,.38),rgba(7,13,34,.16)_32%,rgba(7,13,34,.9)_88%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(244,239,230,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(244,239,230,.045)_1px,transparent_1px)] bg-[length:56px_56px]" />

          <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em]">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_12px_#10b981]" />
              Open today
            </div>
            <div className="hidden rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9ca3af] sm:block">
              {serviceArea}
            </div>
          </div>

          <div className="relative z-10 mx-auto grid w-full max-w-7xl items-end gap-10 pt-28 lg:grid-cols-[1.55fr_.9fr]">
            <div>
              <h1 className="max-w-5xl text-[clamp(4rem,12vw,10rem)] font-black uppercase italic leading-[.82] tracking-tight [font-family:'Arial_Narrow',Impact,sans-serif]">
                {heroWords.map((word, index) => (
                  <span key={`${word}-${index}`} className="block">
                    {word}
                  </span>
                ))}
              </h1>
              <div className="mt-8 flex flex-wrap gap-6 border-t border-white/15 pt-6">
                <HeroMeta label="Service" value={specialty} />
                <HeroMeta label="Area" value={serviceArea} />
                <HeroMeta label="Phone" value={phone ?? "Request a quote"} />
              </div>
            </div>

            <div className="max-w-md lg:ml-auto">
              <p className="text-base leading-7 text-[#f4efe6]/80">
                <span className="font-bold text-[#f4efe6]">{businessName}</span>{" "}
                {content.subheadline}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={telHref ?? "#contact"}
                  className="rounded-full bg-[#b5172a] px-6 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-[#8e0f1f]"
                >
                  {content.cta}
                </a>
                <a
                  href="#services"
                  className="rounded-full border border-white/15 px-6 py-3 text-sm font-bold uppercase tracking-wide text-[#f4efe6] hover:bg-white/10"
                >
                  View services
                </a>
              </div>
            </div>
          </div>
        </section>

        <Marquee items={marqueeItems} />

        <section id="services" className="px-5 py-20 md:px-10 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              number="/ 01 - SERVICES"
              title="What we fix."
              body={content.city_body_copy}
            />
            <div className="grid overflow-hidden border border-black/10 bg-black/10 md:grid-cols-2 lg:grid-cols-3">
              {content.services.map((service, index) => (
                <article
                  key={service}
                  className="min-h-56 bg-[#faf7f0] p-7 transition hover:bg-[#0b0d14] hover:text-[#f4efe6]"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#6b7280]">
                      /{String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xl">↗</span>
                  </div>
                  <h3 className="mt-16 text-3xl font-black uppercase italic leading-none [font-family:'Arial_Narrow',Impact,sans-serif]">
                    {service}
                  </h3>
                  <p className="mt-3 text-sm leading-6 opacity-75">
                    Straightforward scheduling, clear communication, and work handled by a local team.
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="why" className="bg-[#070d22] px-5 py-20 text-[#f4efe6] md:px-10 lg:py-32">
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
            <div className="relative aspect-[4/5] overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[0] ?? heroImage} alt="" className="h-full w-full object-cover" />
              <span className="absolute bottom-6 left-6 rounded bg-[#f4efe6] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0b0d14]">
                Inside the shop
              </span>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b5172a]">
                / 02 - WHY US
              </p>
              <h2 className="mt-4 text-5xl font-black uppercase italic leading-[.88] [font-family:'Arial_Narrow',Impact,sans-serif] md:text-7xl">
                Big-shop work.
                <br />
                <span className="text-[#b5172a]">Neighborhood</span>
                <br />
                honesty.
              </h2>
              <p className="mt-7 max-w-xl text-lg leading-8 text-[#f4efe6]/75">
                {content.local_seo_headline} {content.city_body_copy}
              </p>
              <div className="mt-10 grid border border-white/15 bg-white/15 sm:grid-cols-2">
                <Stat value="Local" label="Service area" />
                <Stat value="Clear" label="Communication" cream />
                <Stat value="Fast" label="Customer contact" cream />
                <Stat value="100%" label="Demo ready" />
              </div>
            </div>
          </div>
        </section>

        <section id="gallery" className="bg-[#0b0d14] px-5 py-20 text-[#f4efe6] md:px-10 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              number="/ 03 - THE SHOP"
              title="Drop in. Look around."
              body="A visual-first section for shop photos, work examples, before-and-after projects, or team shots."
              dark
            />
            <div className="grid auto-rows-[88px] grid-cols-6 gap-4 lg:grid-cols-12">
              <GalleryTile src={photos[0] ?? shopImage} label="The Shop" index="01/06" className="col-span-6 row-span-5 lg:col-span-7" />
              <GalleryTile src={photos[1] ?? heroImage} label="Lift Bay" index="02/06" className="col-span-6 row-span-3 lg:col-span-5" />
              {content.services.slice(0, 4).map((service, index) => (
                <GalleryTile
                  key={service}
                  label={service}
                  index={`${String(index + 3).padStart(2, "0")}/06`}
                  className="col-span-6 row-span-2 lg:col-span-3"
                />
              ))}
            </div>
          </div>
        </section>

        {content.testimonials.length > 0 && (
          <section id="reviews" className="bg-[#f4efe6] px-5 py-20 md:px-10 lg:py-32">
            <div className="mx-auto max-w-7xl">
              <div className="mb-14 grid items-end gap-8 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b5172a]">
                    / 04 - WHAT FOLKS SAY
                  </p>
                  <h2 className="mt-3 text-6xl font-black uppercase italic leading-none [font-family:'Arial_Narrow',Impact,sans-serif]">
                    Receipts.
                  </h2>
                </div>
                <div className="flex items-end gap-4">
                  <span className="text-8xl font-black italic leading-[.8] [font-family:'Arial_Narrow',Impact,sans-serif]">
                    5.0
                  </span>
                  <span className="pb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#6b7280]">
                    ★★★★★
                    <br />
                    Demo reviews
                  </span>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {content.testimonials.map((testimonial) => (
                  <figure
                    key={`${testimonial.author}-${testimonial.quote}`}
                    className="border border-black/10 bg-[#faf7f0] p-7"
                  >
                    <p className="text-sm text-amber-500">★★★★★</p>
                    <blockquote className="mt-5 text-base leading-7 text-[#1a1d26]">
                      &ldquo;{testimonial.quote}&rdquo;
                    </blockquote>
                    <figcaption className="mt-6 flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-full bg-[#0e1b3d] text-sm font-bold text-[#f4efe6]">
                        {testimonial.author[0]}
                      </span>
                      <span>
                        <span className="block text-sm font-bold">{testimonial.author}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7280]">
                          Local customer
                        </span>
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="contact" className="px-5 py-20 md:px-10 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              number="/ 05 - VISIT"
              title="Find us. Book fast."
              body={content.contact_body}
            />
            <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr]">
              <div className="grid gap-5">
                <ContactBlock label="Business" value={businessName} sub={specialty} />
                <ContactBlock label="Phone" value={phone ?? "Add phone number"} sub="Fastest response during business hours." />
                <ContactBlock label="Area" value={serviceArea} sub={content.contact_heading} />
              </div>
              <div className="relative min-h-[420px] overflow-hidden rounded-lg bg-[#0b0d14]">
                {googleMapsUrl ? (
                  <iframe
                    src={`https://www.google.com/maps?q=${encodeURIComponent(businessName)}+${encodeURIComponent(city ?? "")}&output=embed`}
                    className="absolute inset-0 h-full w-full rounded-lg border-0"
                    loading="lazy"
                    title="Business location"
                    allowFullScreen
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(244,239,230,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(244,239,230,.05)_1px,transparent_1px)] bg-[length:42px_42px]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(181,23,42,.28),transparent_42%)]" />
                    <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-3">
                      <span className="whitespace-nowrap rounded bg-[#f4efe6] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#0b0d14]">
                        {businessName}
                      </span>
                      <span className="size-4 rounded-full bg-[#b5172a] shadow-[0_0_0_8px_rgba(181,23,42,.25),0_0_0_18px_rgba(181,23,42,.12)]" />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0b0d14] px-5 py-12 text-[#f4efe6] md:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 border-b border-white/10 pb-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoImage} alt="" className="mb-4 size-14 rounded-full bg-[#f4efe6] p-1" />
            <h4 className="text-2xl font-black uppercase italic [font-family:'Arial_Narrow',Impact,sans-serif]">
              {businessName}
            </h4>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#9ca3af]">
              {specialty} in {serviceArea}. Demo website, not an official site of this business.
            </p>
          </div>
          <FooterLinks title="Services" items={content.services.slice(0, 4)} />
          <FooterLinks title="Shop" items={["About", "Gallery", "Reviews", "Contact"]} />
          <div>
            <h5 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#b5172a]">
              Contact
            </h5>
            <a href={telHref ?? "#contact"} className="text-sm text-[#f4efe6]/75 hover:text-white">
              {phone ?? content.cta}
            </a>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-2 pt-6 text-xs font-bold uppercase tracking-wide text-[#9ca3af] sm:flex-row sm:justify-between">
          <span>Demo website preview</span>
          <span>{new Date().getFullYear()} · OpenCRM</span>
        </div>
      </footer>
    </div>
  );
}

function splitHeadline(headline: string) {
  const words = headline.trim().split(/\s+/);
  if (words.length <= 4) return words;
  const lines: string[] = [];
  for (let index = 0; index < words.length; index += 2) {
    lines.push(words.slice(index, index + 2).join(" "));
  }
  return lines.slice(0, 4);
}

function HeroMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9ca3af]">{label}</p>
      <p className="mt-1 text-2xl font-black uppercase italic text-[#f4efe6] [font-family:'Arial_Narrow',Impact,sans-serif]">
        {value}
      </p>
    </div>
  );
}

function Marquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items, ...items];
  return (
    <div className="overflow-hidden bg-[#0b0d14] py-5 text-[#f4efe6]">
      <div className="flex w-max animate-[demo-marquee_38s_linear_infinite] gap-12 whitespace-nowrap">
        {doubled.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center gap-5 text-3xl font-black uppercase italic [font-family:'Arial_Narrow',Impact,sans-serif]"
          >
            {item}
            <span className="size-2.5 rounded-full bg-[#b5172a]" />
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  number,
  title,
  body,
  dark = false,
}: {
  number: string;
  title: string;
  body: string;
  dark?: boolean;
}) {
  return (
    <div className="mb-14 grid items-end gap-8 md:grid-cols-[auto_1fr]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b5172a]">{number}</p>
        <h2
          className={`mt-3 text-5xl font-black uppercase italic leading-[.88] [font-family:'Arial_Narrow',Impact,sans-serif] md:text-7xl ${
            dark ? "text-[#f4efe6]" : "text-[#0b0d14]"
          }`}
        >
          {title}
        </h2>
      </div>
      <p className={`max-w-md text-sm leading-6 md:justify-self-end ${dark ? "text-[#f4efe6]/65" : "text-[#6b7280]"}`}>
        {body}
      </p>
    </div>
  );
}

function Stat({ value, label, cream = false }: { value: string; label: string; cream?: boolean }) {
  return (
    <div className="bg-[#070d22] p-7">
      <p
        className={`text-5xl font-black uppercase italic leading-none [font-family:'Arial_Narrow',Impact,sans-serif] ${
          cream ? "text-[#f4efe6]" : "text-[#b5172a]"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9ca3af]">
        {label}
      </p>
    </div>
  );
}

function GalleryTile({
  src,
  label,
  index,
  className,
}: {
  src?: string;
  label: string;
  index: string;
  className: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded bg-[#1a1d26] ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover transition duration-700 hover:scale-105" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(45deg,rgba(244,239,230,.04)_0_14px,rgba(244,239,230,.08)_14px_28px)] p-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-[#9ca3af]">
          [ {label} photo ]
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/70 to-transparent p-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[#f4efe6]">
        <span>{label}</span>
        <span className="text-[#9ca3af]">{index}</span>
      </div>
    </div>
  );
}

function ContactBlock({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-black/10 bg-white p-7">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b5172a]">{label}</p>
      <p className="mt-3 text-3xl font-black uppercase italic leading-none [font-family:'Arial_Narrow',Impact,sans-serif]">
        {value}
      </p>
      <p className="mt-3 text-sm leading-6 text-[#6b7280]">{sub}</p>
    </div>
  );
}

function FooterLinks({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h5 className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[#b5172a]">
        {title}
      </h5>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item}>
            <a href="#services" className="text-sm text-[#f4efe6]/75 hover:text-white">
              {item}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
