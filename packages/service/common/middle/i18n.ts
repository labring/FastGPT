import { LocaleList, type localeType } from '@fastgpt/global/common/i18n/type';
import type { ApiRequestProps } from '../../type/next';

/**
 * Get the locale from the request cookies
 * @param req - The request object
 * @returns The locale string, 'en' by default
 */
export const getLocale = (req: ApiRequestProps): localeType => {
  const locale = req.cookies['NEXT_LOCALE'];
  if (locale && LocaleList.includes(locale as localeType)) {
    return locale as localeType;
  }
  return 'en';
};
