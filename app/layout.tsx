import type { Metadata, Viewport } from "next";
import { SteadFastPromptProvider } from "@/app/components/steadfast-prompt-provider";
import { StructuredData } from "@/app/components/structured-data";
import { STEADFAST_SITE_URL } from "@/lib/seo/metadata";
import "./globals.css";

const siteUrl = STEADFAST_SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SteadFast Realty | Property, connected",
    template: "%s | SteadFast Realty",
  },
  description:
    "A modern real estate platform built for Jamaica's agents, brokerages, and property seekers.",
  applicationName: "SteadFast Realty",
  openGraph: {
    title: "SteadFast Realty",
    description: "Property, connected. Built for Jamaica.",
    url: siteUrl,
    siteName: "SteadFast Realty",
    locale: "en_JM",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#102c2a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-JM">
      <body>
        <SteadFastPromptProvider>{children}</SteadFastPromptProvider>
        <StructuredData value={[
          { "@context": "https://schema.org", "@type": "Organization", name: "SteadFast Realty", url: siteUrl, areaServed: { "@type": "Country", name: "Jamaica" } },
          { "@context": "https://schema.org", "@type": "WebSite", name: "SteadFast Realty", url: siteUrl, inLanguage: "en-JM" },
        ]} />
      </body>
    </html>
  );
}
