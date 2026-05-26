import { type I18nNsType } from '@fastgpt/web/i18n/i18next';
import { getLangMapping } from '@fastgpt/web/i18n/utils';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const serviceSideProps = async (content: any, ns: I18nNsType = []) => {
  const cookieLang = content.req?.cookies?.NEXT_LOCALE;
  const lang = getLangMapping(cookieLang || content.locale || '');
  const extraLng = content.req?.cookies?.NEXT_LOCALE ? undefined : content.locales;

  // Device size
  const deviceSize = content.req?.cookies?.NEXT_DEVICE_SIZE || null;

  return {
    ...(await serverSideTranslations(lang, ['common', ...ns], undefined, extraLng)),
    deviceSize
  };
};
