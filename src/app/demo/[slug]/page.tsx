import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { DemoTemplate } from "@/features/websites/components/DemoTemplate";
import type { DemoContent } from "@/lib/ai";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await prisma.generatedWebsite.findUnique({
    where: { slug },
    select: { title: true },
  });
  return { title: site?.title ?? "Demo Site" };
}

export default async function DemoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await prisma.generatedWebsite.findUnique({
    where: { slug },
    include: { lead: { select: { company: true, phone: true, city: true, source: true, mapsUrl: true } } },
  });

  if (!site) notFound();

  const content = site.content as unknown as DemoContent;

  return (
    <DemoTemplate
      businessName={site.lead.company ?? site.title}
      phone={site.lead.phone}
      city={site.lead.city}
      category={site.lead.source}
      content={content}
    />
  );
}
