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

    /*
     * DO NOT turn on `experimental.inlineCss` here. It was tried and reverted.
     *
     * The appeal is real: the product ships one 7.5 KB stylesheet, and as a
     * separate request it blocks first paint for a round trip -- expensive at
     * 150 ms RTT. It measured well, taking the 90-dish grid from a noisy 95
     * (85,97,86,97,95) to a steady 97 (86,97,97,97,97).
     *
     * It also broke the admin dish page. `Price (USD)` never appears, so an
     * owner cannot edit a price, and `admin.spec` and `admin-photo.spec` both
     * time out on chromium and mobile. Isolated by flipping this one flag: off
     * it passes in 9s, on it times out at 30s.
     *
     * Two Lighthouse points are not worth breaking the one thing this product
     * promises -- that an owner changes a price themselves without calling
     * anyone. Revisit if Next stabilises the flag; the render-blocking
     * stylesheet is still the largest remaining item in the audit.
     */
  },
};

export default nextConfig;
