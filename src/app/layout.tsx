import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import Sidebar from '@/components/Sidebar';
import { Toaster } from 'sonner';
import ThemeProvider from '@/components/theme/Provider';
import I18nProvider from '@/components/i18n-provider';

const montserrat = Montserrat({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://finance.newfan.co.jp';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'NewFan-Finance | AI金融ニュース・分析プラットフォーム',
    template: '%s | NewFan-Finance',
  },
  description:
    'NewFan-Financeは、AI搭載の金融ニュース分析プラットフォームです。最新の金融・投資・市場ニュースをリアルタイムで配信し、AIチャットボットが質問に答えます。',
  applicationName: 'NewFan-Finance',
  authors: [{ name: 'NewFan-Finance' }],
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: siteUrl,
    siteName: 'NewFan-Finance',
    title: 'NewFan-Finance | AI金融ニュース・分析プラットフォーム',
    description:
      'AI搭載の金融ニュース分析プラットフォーム。最新の金融・投資・市場ニュースをリアルタイムで配信。',
    images: [
      {
        url: '/icon.png',
        width: 440,
        height: 440,
        alt: 'NewFan-Finance',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'NewFan-Finance | AI金融ニュース・分析プラットフォーム',
    description:
      'AI搭載の金融ニュース分析プラットフォーム。最新の金融・投資・市場ニュースをリアルタイムで配信。',
    images: ['/icon.png'],
  },
  icons: {
    icon: [
      { url: '/icon-50.png', sizes: '50x50', type: 'image/png' },
      { url: '/icon-100.png', sizes: '100x100', type: 'image/png' },
      { url: '/icon.png', sizes: '440x440', type: 'image/png' },
    ],
    apple: [{ url: '/icon.png', sizes: '440x440', type: 'image/png' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="h-full" lang="ja" suppressHydrationWarning>
      <body className={cn('h-full', montserrat.className)}>
        <ThemeProvider>
          <I18nProvider>
            <Sidebar>{children}</Sidebar>
            <Toaster
              toastOptions={{
                unstyled: true,
                classNames: {
                  toast:
                    'bg-light-primary dark:bg-dark-secondary dark:text-white/70 text-black-70 rounded-lg p-4 flex flex-row items-center space-x-2',
                },
              }}
            />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
