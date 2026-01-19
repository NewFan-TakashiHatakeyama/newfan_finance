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
  // ESLintの設定を無視（ビルド時のみ）
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
