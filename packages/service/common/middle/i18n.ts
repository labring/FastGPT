import { LocaleList, type localeType } from '@fastgpt/global/common/i18n/type';
import Cookie from 'cookie';
import type { NodeHttpRequest } from '../../types/http';

/**
 * Get the locale from the standard Cookie request header.
 * @param req - The request object
 * @returns The locale string, 'en' by default
 */
export const getLocale = (req: NodeHttpRequest): localeType => {
  const locale = Cookie.parse(req.headers.cookie ?? '').NEXT_LOCALE;
  console.log(locale, 232323);
  if (locale && LocaleList.includes(locale as localeType)) {
    return locale as localeType;
  }
  return 'en';
};
