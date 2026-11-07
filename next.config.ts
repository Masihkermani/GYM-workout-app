import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { securityHeaders } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Parallel agents run separate dev servers with their own NEXT_DIST_DIR.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Self-contained server (`.next/standalone/server.js` + only the traced node_modules) for the Docker image.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // @node-rs/argon2 and sharp ship native bindings; keep them out of the server bundle.
  serverExternalPackages: ['@node-rs/argon2', 'sharp'],
  // The coach uploads exercise demonstrations through a server action: up to 24 MB per upload (MAX_UPLOAD_BYTES
  // in src/lib/media/constants.ts) plus the form fields.
  experimental: { serverActions: { bodySizeLimit: '26mb' } },
  // CSP, nosniff, referrer and permissions policy, no framing: src/lib/security-headers.ts (HSTS is the proxy's job).
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders({ dev: process.env.NODE_ENV !== 'production' }) }];
  },
};

export default withNextIntl(nextConfig);
