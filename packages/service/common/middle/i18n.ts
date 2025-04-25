import { NextApiRequest } from 'next';

const locales = ['en', 'zh-CN', 'zh-Hant'];
type LocaleType = 'en' | 'zh-CN' | 'zh-Hant';
export const getLocale = (req: NextApiRequest): LocaleType => {
  const locale = req.cookies['NEXT_LOCALE'];
  if (locale && locales.includes(locale)) {
    return locale as LocaleType;
  }
  return 'en';
};
