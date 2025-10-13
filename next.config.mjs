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
};

export default nextConfig;
