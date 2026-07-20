import "server-only";

const DEFAULT_APP_URL = "https://properap.com";

export function getAppUrl() {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL).trim();
  const url = new URL(configured);

  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("The application URL must use HTTPS.");
  }

  return url.origin;
}

export function safeInternalPath(value: string | null, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
