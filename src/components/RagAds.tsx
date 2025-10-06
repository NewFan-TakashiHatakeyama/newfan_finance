'use client';

import React from 'react';
import { Building, Calendar } from 'lucide-react';

// APIを介して広告情報を取得するためのダミー関数
const fetchAds = async () => {
  // 本来はここでAPIを呼び出し、広告データを取得します。
  // 今回はダミーデータを返します。
  return [
    {
      id: 1,
      title: 'ブース設計〜施工〜現地運営〜商談フォローまで一括。',
      subtitle: 'BoothCraft Asia「グローバル出展支援」',
      icon: <Building size={24} />,
      url: '#',
    },
    {
      id: 2,
      title: '団体割＋近接動線で...',
      subtitle: 'EventStay「学会・...」',
      icon: <Calendar size={24} />,
      url: '#',
    },
  ];
};

const RagAds = () => {
  const [ads, setAds] = React.useState<any[]>([]);

  React.useEffect(() => {
    const loadAds = async () => {
      const adData = await fetchAds();
      setAds(adData);
    };
    loadAds();
  }, []);

  if (ads.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 pt-6 border-t border-light-200/50 dark:border-dark-200/50">
      <h3 className="text-xs text-black/60 dark:text-white/60 mb-4">広告</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ads.map((ad) => (
          <a
            key={ad.id}
            href={ad.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 border border-light-200/50 dark:border-dark-200/50 rounded-lg hover:bg-light-secondary/50 dark:hover:bg-dark-secondary/50 transition-colors duration-200"
          >
            <div className="flex-shrink-0 text-black/80 dark:text-white/80">
              {ad.icon}
            </div>
            <div>
              <p className="text-sm font-medium text-black dark:text-white">
                {ad.title}
              </p>
              <p className="text-xs text-black/60 dark:text-white/60">
                {ad.subtitle}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default RagAds;
