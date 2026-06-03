import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // CRM document uploads (Phase 2B) can be up to 25 MB per file.
      // Default cap is 1 MB which silently rejects any reasonable photo
      // scan or PDF transcript. Must match MAX_FILE_SIZE in
      // app/(dashboard)/crm/clients/documents/actions.ts.
      bodySizeLimit: "25mb",
    },
  },
  outputFileTracingIncludes: {
    "/crm/assistant": ["./memory/projects/crm/*.md"],
  },
};

export default nextConfig;
