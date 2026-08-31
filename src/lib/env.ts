import "server-only";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getPolarServer(): "sandbox" | "production" {
  const server = required("POLAR_SERVER");
  if (server !== "sandbox" && server !== "production") {
    throw new Error("POLAR_SERVER must be either sandbox or production");
  }
  return server;
}

export function getAppUrl() {
  const configured = process.env.APP_URL?.trim();
  const value = configured
    ? configured
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NODE_ENV !== "production"
        ? "http://localhost:3000"
        : required("APP_URL");

  const url = new URL(value);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production");
  }
  return url.origin;
}

export function getPolarAccessToken() {
  return required("POLAR_ACCESS_TOKEN");
}

export function getPolarProductId() {
  return required("POLAR_PRODUCT_ID");
}

export function getPolarWebhookSecret() {
  return required("POLAR_WEBHOOK_SECRET");
}

export function getDatabaseUrl() {
  return required("DATABASE_URL");
}
