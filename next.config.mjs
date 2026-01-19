/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mma.prnasia.com',
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
