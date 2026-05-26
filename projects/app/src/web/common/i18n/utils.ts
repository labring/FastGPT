import { type I18nNsType } from '@fastgpt/web/i18n/i18next';
import { getLangMapping } from '@fastgpt/web/i18n/utils';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const serviceSideProps = async (content: any, ns: I18nNsType = []) => {
  const lang = getLangMapping(content.req?.cookies?.NEXT_LOCALE || content.locale || '');
  // 预加载同级语言资源，首次自动初始化语言时可以直接完成客户端切换。
  const extraLng = content.locales?.filter((locale: string) => locale !== lang);

  // Device size
  const deviceSize = content.req?.cookies?.NEXT_DEVICE_SIZE || null;

  return {
    ...(await serverSideTranslations(lang, ['common', ...ns], undefined, extraLng)),
    deviceSize
  };
};
