import { type I18nNsType } from '@fastgpt/web/i18n/i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const serviceSideProps = async (content: any, ns: I18nNsType = []) => {
  const lang = content.req?.cookies?.NEXT_LOCALE || content.locale;
  const extraLng = content.req?.cookies?.NEXT_LOCALE ? undefined : content.locales;

  // Device size
  const deviceSize = content.req?.cookies?.NEXT_DEVICE_SIZE || null;

  return {
    ...(await serverSideTranslations(lang, ['common', ...ns], undefined, extraLng)),
    deviceSize
  };
};
