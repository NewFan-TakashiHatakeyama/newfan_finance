import type { Metadata } from 'next';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://finance.newfan.co.jp';

export const metadata: Metadata = {
  title: '金融ニュース一覧 | NewFan-Finance',
  description:
    '最新の金融・投資・市場・不動産ニュースをカテゴリ別に一覧表示。AI分析プラットフォームNewFan-Financeが世界中のニュースソースからリアルタイムで配信します。',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: `${siteUrl}/discover`,
    siteName: 'NewFan-Finance',
    title: '金融ニュース一覧 | NewFan-Finance',
    description:
      '最新の金融・投資・市場・不動産ニュースをカテゴリ別に一覧表示。世界中のニュースソースからリアルタイム配信。',
    images: [
      {
        url: '/icon.png',
        width: 440,
        height: 440,
        alt: 'NewFan-Finance 金融ニュース',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: '金融ニュース一覧 | NewFan-Finance',
    description:
      '最新の金融・投資・市場・不動産ニュースをカテゴリ別に一覧表示。世界中のニュースソースからリアルタイム配信。',
    images: ['/icon.png'],
  },
  alternates: {
    canonical: `${siteUrl}/discover`,
  },
};

export default function DiscoverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
