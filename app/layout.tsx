import type { Metadata, Viewport } from "next";
import { SteadFastPromptProvider } from "@/app/components/steadfast-prompt-provider";
import { StructuredData } from "@/app/components/structured-data";
import { CookieNotice } from "@/app/components/cookie-notice";
import { STEADFAST_SITE_URL } from "@/lib/seo/metadata";
import "./globals.css";

const siteUrl = STEADFAST_SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ProperAP | Property, connected",
    template: "%s | ProperAP",
  },
  description:
    "A modern real estate platform built for Jamaica's agents, brokerages, and property seekers.",
  applicationName: "ProperAP",
  openGraph: {
    title: "ProperAP",
    description: "Property, connected. Built for Jamaica.",
    url: siteUrl,
    siteName: "ProperAP",
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
        <CookieNotice />
        <StructuredData value={[
          { "@context": "https://schema.org", "@type": "Organization", name: "ProperAP", url: siteUrl, areaServed: { "@type": "Country", name: "Jamaica" } },
          { "@context": "https://schema.org", "@type": "WebSite", name: "ProperAP", url: siteUrl, inLanguage: "en-JM" },
        ]} />
      </body>
    </html>
  );
}
