import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * Server Actions default to a 1 MB request body, which rejects essentially
     * every photo taken on a phone. The failure surfaces as a generic action
     * error rather than a size message, so to the owner it looks like a broken
     * upload button.
     *
     * Kept above the 8 MB cap in core/media/validate.ts so an oversized upload
     * is refused by OUR check, with a message naming the limit -- rather than
     * by the framework, with one that does not.
     */
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
