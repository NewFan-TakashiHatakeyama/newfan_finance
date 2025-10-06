import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import translationJA from './locales/ja.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: {
        translation: translationJA,
      },
    },
    lng: 'ja',
    fallbackLng: 'ja',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
