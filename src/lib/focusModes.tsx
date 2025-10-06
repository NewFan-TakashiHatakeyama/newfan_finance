import {
  Building2,
  CircleDollarSign,
  FileInput,
  Newspaper,
  SwatchBook,
  TrendingUp,
} from 'lucide-react';

export const focusModes = [
  {
    key: 'finance',
    title: '金融・投資',
    description: '世界および地域の金融市場・投資動向・資産運用・証券取引',
    icon: <CircleDollarSign size={20} />,
  },
  {
    key: 'market',
    title: '市場動向・業績',
    description: '企業の業績発表、決算速報、産業別市場動向',
    icon: <TrendingUp size={20} />,
  },
  {
    key: 'capital',
    title: '資本取引',
    description: 'M&A（合併・買収）、資金調達、IPO、株式譲渡など企業の資本戦略',
    icon: <Newspaper size={20} />,
  },
  {
    key: 'real_estate',
    title: '不動産',
    description: '国内外の不動産開発、投資、建設、都市計画に関する最新動向',
    icon: <Building2 size={20} />,
  },
  {
    key: 'special',
    title: '特殊分野',
    description:
      'スタートアップ、フィンテック、グリーン投資、代替資産など、新興または専門性の高い分野',
    icon: <SwatchBook size={20} />,
  },
  {
    key: 'prnewswire',
    title: 'PR Newswire',
    description: 'PR Newswireによる企業発表・業界別ニュース・プレスリリース',
    icon: <FileInput size={20} />,
  },
];
