import { type I18nNsType } from '@fastgpt/web/i18n/i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

type ServiceSidePropsOptions = {
  langCookieKey?: string;
};

export const serviceSideProps = async (
  content: any,
  ns: I18nNsType = [],
  options: ServiceSidePropsOptions = {}
) => {
  const langCookieKey = options.langCookieKey || 'NEXT_LOCALE';
  const cookieLang = content.req?.cookies?.[langCookieKey];
  const lang = cookieLang || content.locale;
  // 预加载同级语言资源，用户手动切换语言时优先走客户端切换，缺资源才刷新兜底。
  const extraLng = content.locales?.filter((locale: string) => locale !== lang);

  // Device size
  const deviceSize = content.req?.cookies?.NEXT_DEVICE_SIZE || null;

  return {
    ...(await serverSideTranslations(lang, ['common', ...ns], undefined, extraLng)),
    deviceSize
  };
};
