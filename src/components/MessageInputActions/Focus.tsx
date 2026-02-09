import {
  Building2,
  ChevronDown,
  CircleDollarSign,
  FileInput,
  Layers,
  Newspaper,
  ScanEye,
  SwatchBook,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react';
import { Fragment } from 'react';
import { useChat } from '@/lib/hooks/useChat';

const focusModes = [
  {
    key: 'allCategories',
    title: '全カテゴリ',
    description: '全カテゴリの記事を横断的にセマンティック検索',
    icon: <Layers size={20} />,
  },
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

const Focus = () => {
  const { focusMode, setFocusMode } = useChat();

  return (
    <Popover className="relative w-full max-w-[15rem] md:max-w-md lg:max-w-lg mt-[6.5px]">
      <PopoverButton
        type="button"
        className=" text-black/50 dark:text-white/50 rounded-xl hover:bg-light-secondary dark:hover:bg-dark-secondary active:scale-95 transition duration-200 hover:text-black dark:hover:text-white"
      >
        {focusMode ? (
          <div className="flex flex-row items-center space-x-1">
            {focusModes.find((mode) => mode.key === focusMode)?.icon}
            <p className="text-xs font-medium hidden lg:block">
              {focusModes.find((mode) => mode.key === focusMode)?.title}
            </p>
            <ChevronDown size={20} className="-translate-x-1" />
          </div>
        ) : (
          <div className="flex flex-row items-center space-x-1">
            <ScanEye size={20} />
            <p className="text-xs font-medium hidden lg:block">Focus</p>
          </div>
        )}
      </PopoverButton>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <PopoverPanel className="absolute z-10 w-64 md:w-[500px] left-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 bg-light-primary dark:bg-dark-primary border rounded-lg border-light-200 dark:border-dark-200 w-full p-4 max-h-[200px] md:max-h-none overflow-y-auto">
            {focusModes.map((mode, i) => (
              <PopoverButton
                onClick={() => setFocusMode(mode.key)}
                key={i}
                className={cn(
                  'p-2 rounded-lg flex flex-col items-start justify-start text-start space-y-2 duration-200 cursor-pointer transition',
                  focusMode === mode.key
                    ? 'bg-light-secondary dark:bg-dark-secondary'
                    : 'hover:bg-light-secondary dark:hover:bg-dark-secondary',
                )}
              >
                <div
                  className={cn(
                    'flex flex-row items-center space-x-1',
                    focusMode === mode.key
                      ? 'text-[#24A0ED]'
                      : 'text-black dark:text-white',
                  )}
                >
                  {mode.icon}
                  <p className="text-sm font-medium">{mode.title}</p>
                </div>
                <p className="text-black/70 dark:text-white/70 text-xs">
                  {mode.description}
                </p>
              </PopoverButton>
            ))}
          </div>
        </PopoverPanel>
      </Transition>
    </Popover>
  );
};

export default Focus;
