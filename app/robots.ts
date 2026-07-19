import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account/", "/broker/", "/workspace/", "/mfa/", "/invite/",
        "/sign-in", "/register", "/forgot-password", "/set-password", "/access-denied",
      ],
    },
    sitemap: "https://properap.com/sitemap.xml",
  };
}
