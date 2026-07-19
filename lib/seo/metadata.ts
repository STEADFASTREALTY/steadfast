import type { Metadata } from "next";

export const STEADFAST_SITE_URL = "https://properap.com";

export function publicPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  const url = new URL(input.path, STEADFAST_SITE_URL).toString();
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    category: "real estate",
    keywords: input.keywords,
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: "SteadFast Realty",
      locale: "en_JM",
      type: "website",
    },
    twitter: { card: "summary_large_image", title: input.title, description: input.description },
    robots: { index: true, follow: true },
  };
}

export function privatePageMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  };
}
