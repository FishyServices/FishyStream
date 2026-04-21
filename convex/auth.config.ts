import type { AuthConfig } from "convex/server";

const domain =
  process.env.CLERK_JWT_ISSUER_DOMAIN ??
  process.env.CLERK_FRONTEND_API_URL ??
  process.env.CLERK_ISSUER_URL;

if (!domain) {
  throw new Error(
    "Missing CLERK_JWT_ISSUER_DOMAIN, CLERK_FRONTEND_API_URL, or CLERK_ISSUER_URL for Convex Clerk auth"
  );
}

export default {
  providers: [
    {
      domain,
      applicationID: "convex"
    }
  ]
} satisfies AuthConfig;
