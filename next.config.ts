import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Parallel agents run separate dev servers with their own NEXT_DIST_DIR.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // @node-rs/argon2 ships a native binding; keep it out of the server bundle.
  serverExternalPackages: ['@node-rs/argon2'],
};

export default withNextIntl(nextConfig);
