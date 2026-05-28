import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/Providers";

const appName = "ClientCore";
const appDescription =
  "The all-in-one CRM platform to automate outreach, manage clients, and scale faster with AI.";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const appUrl = `${proto}://${host}`;

  return {
    metadataBase: new URL(appUrl),
    applicationName: appName,
    title: {
      default: appName,
      template: `%s | ${appName}`,
    },
    description: appDescription,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: appName,
      title: `${appName} — AI CRM & Lead Automation`,
      description: appDescription,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: `${appName} — AI CRM & Lead Automation`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${appName} — AI CRM & Lead Automation`,
      description: appDescription,
      images: ["/twitter-image"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
