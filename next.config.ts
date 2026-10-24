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
  // @node-rs/argon2 ships a native binding; keep it out of the server bundle.
  serverExternalPackages: ['@node-rs/argon2'],
  // CSP, nosniff, referrer and permissions policy, no framing: src/lib/security-headers.ts (HSTS is the proxy's job).
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders({ dev: process.env.NODE_ENV !== 'production' }) }];
  },
};

export default withNextIntl(nextConfig);
