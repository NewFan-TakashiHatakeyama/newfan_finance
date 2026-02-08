import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mma.prnasia.com',
      },
      {
        protocol: 'https',
        hostname: '*.prnewswire.com',
      },
      {
        protocol: 'https',
        hostname: '*.globenewswire.com',
      },
    ],
  },
  serverExternalPackages: ['pdf-parse'],
  // ESLintの設定を一時的に無視（循環参照エラー回避のため）
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
