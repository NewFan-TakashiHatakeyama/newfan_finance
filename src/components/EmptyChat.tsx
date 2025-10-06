'use client';

import { Settings } from 'lucide-react';
import EmptyChatMessageInput from './EmptyChatMessageInput';
import { File } from './ChatWindow';
import Link from 'next/link';
import Image from 'next/image';
import WeatherWidget from './WeatherWidget';
import NewsArticleWidget from './NewsArticleWidget';
import { useTranslation } from 'react-i18next';

const EmptyChat = () => {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <div className="absolute w-full flex flex-row items-center justify-end mr-5 mt-5">
        <Link href="/settings">
          <Settings className="cursor-pointer lg:hidden" />
        </Link>
      </div>
      <div className="flex flex-col items-center justify-center min-h-screen max-w-screen-md mx-auto p-3 space-y-5">
        <div className="flex flex-col items-center justify-center w-full space-y-8">
          <Image
            src="/title_logo.png"
            alt="logo"
            width={200}
            height={50}
            className="-mt-8"
          />
          <EmptyChatMessageInput />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 w-full gap-5 mt-3">
          <WeatherWidget />
          <NewsArticleWidget />
        </div>
      </div>
    </div>
  );
};

export default EmptyChat;
