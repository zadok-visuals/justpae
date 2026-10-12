import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
  experimental: {
    /**
     * A SAFETY NET, not a feature. Files no longer travel through server
     * actions at all — KYC uploads go straight from the browser to private
     * storage and the action receives only a path string (see
     * src/lib/storage/clientUpload.ts for the production crash that caused).
     *
     * This is raised from the 1MB default purely so that an action which
     * accidentally grows a large text payload fails loudly in its own
     * try/catch rather than being rejected before it runs — the failure mode
     * that made the upload bug so hard to see. It is deliberately NOT large
     * enough to carry a phone photo: doing that would invite the old pattern
     * back, and the platform's own function body limit sits above it anyway.
     */
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
