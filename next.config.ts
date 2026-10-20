import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ['@prisma/client'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};
export default config;
