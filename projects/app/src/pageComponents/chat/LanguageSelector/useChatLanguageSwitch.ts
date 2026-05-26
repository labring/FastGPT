import { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { langMap, LangEnum, type localeType } from '@fastgpt/global/common/i18n/type';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';
import { getLangMapping } from '@fastgpt/web/i18n/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';

export type ChatLanguageSelectorMode = 'account' | 'share';

export const chatLanguageList: localeType[] = [LangEnum.zh_CN, LangEnum.zh_Hant, LangEnum.en];

/**
 * 聊天页语言切换业务逻辑。
 * account 模式需要同步用户语言偏好；share 模式只切换全局 NEXT_LOCALE。
 */
export const useChatLanguageSwitch = (mode: ChatLanguageSelectorMode) => {
  const { i18n, t } = useTranslation();
  const { toast } = useToast();
  const { onChangeLng } = useI18nLng();
  const { userInfo, updateUserInfo } = useUserStore();
  const username = userInfo?.username;
  const currentLang = getLangMapping(i18n.language) as localeType;

  const currentLabel = useMemo(() => {
    return langMap[currentLang]?.label || langMap[LangEnum.zh_CN].label;
  }, [currentLang]);

  const onChangeLanguage = useCallback(
    async (lng: localeType, onSelected?: () => void) => {
      try {
        if (mode === 'account' && username) {
          await updateUserInfo({
            language: lng
          });
        }

        await onChangeLng(lng, { reloadOnChange: true });
        onSelected?.();
      } catch {
        toast({
          status: 'error',
          title: t('common:language_switch_failed')
        });
      }
    },
    [mode, onChangeLng, t, toast, updateUserInfo, username]
  );

  return {
    currentLang,
    currentLabel,
    onChangeLanguage
  };
};
