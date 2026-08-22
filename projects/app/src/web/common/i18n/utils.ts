import { type I18nNsType } from '@fastgpt/web/i18n/i18next';
import { getLangMapping, LANG_KEY } from '@fastgpt/web/i18n/utils';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

type ServiceSidePropsOptions = {
  langCookieKey?: string;
  fallbackLangCookieKey?: string;
};

export const serviceSideProps = async (
  content: any,
  ns: I18nNsType = [],
  options: ServiceSidePropsOptions = {}
) => {
  const langCookieKey = options.langCookieKey || LANG_KEY;
  const lang = getLangMapping(
    content.req?.cookies?.[langCookieKey] ||
      (options.fallbackLangCookieKey
        ? content.req?.cookies?.[options.fallbackLangCookieKey]
        : undefined) ||
      content.locale ||
      ''
  );
  // SSR 只额外预加载中文资源；英文、韩文等语言由客户端按需加载，避免首屏携带全部语言包。
  const extraLng = content.locales?.filter(
    (locale: string) => locale !== lang && locale.toLowerCase().startsWith('zh')
  );

  const namespaces = Array.from(new Set<I18nNsType[number]>(['common', 'price', ...ns]));

  return serverSideTranslations(lang, namespaces, undefined, extraLng);
};
