import { readFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { NextResponse, type NextRequest } from "next/server";
import { createTRPCContext } from "@/server/trpc";
import type { DemoContent } from "@/lib/ai";
import {
  buildDemoExport,
  demoExportAssetSources,
  type DemoExportFile,
  type DemoExportSite,
} from "@/features/websites/server/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const trpcCtx = await createTRPCContext({ headers: _req.headers });
  const organizationId = trpcCtx.session?.user?.organizationId;

  if (!trpcCtx.session?.user?.id || !organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const site = await trpcCtx.prisma.generatedWebsite.findFirst({
    where: { id, lead: { organizationId } },
    include: {
      lead: {
        select: { company: true, phone: true, city: true, category: true, rating: true, reviewCount: true },
      },
    },
  });

  if (!site) {
    return NextResponse.json({ error: "Demo website not found" }, { status: 404 });
  }

  if (site.template !== "ai_demo") {
    return NextResponse.json({ error: "Only AI demo websites can be downloaded" }, { status: 400 });
  }

  const exportSite: DemoExportSite = {
    title: site.title,
    businessName: site.lead.company ?? site.title,
    phone: site.lead.phone,
    city: site.lead.city,
    category: site.lead.category,
    rating: site.lead.rating,
    reviewCount: site.lead.reviewCount,
    content: site.content as unknown as DemoContent,
  };
  const exportFiles = await readBundledAssets(exportSite);
  const demoExport = buildDemoExport(exportSite, exportFiles);

  const archiveEntries = Object.fromEntries(
    demoExport.files.map((file) => [file.path, file.data]),
  );
  const zipBytes = zipSync(archiveEntries);

  return new Response(zipBytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${demoExport.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function readBundledAssets(site: DemoExportSite): Promise<DemoExportFile[]> {
  const files = await Promise.all(
    demoExportAssetSources(site).map(async (asset) => ({
      path: asset.target,
      data: await readFile(asset.source),
    })),
  );
  return files;
}
