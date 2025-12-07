import { Box, Flex } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import { langMap } from '@fastgpt/global/common/i18n/type';
import { useUserStore } from '@/web/support/user/useUserStore';

const I18nLngSelector = () => {
  const { i18n } = useTranslation();
  const { onChangeLng: onChangeLngI18n } = useI18nLng();
  const { userInfo, updateUserInfo } = useUserStore();

  const onChangeLng = useCallback(
    async (lng: `${LangEnum}`) => {
      if (userInfo?.username) {
        // logined
        await updateUserInfo({
          language: lng
        });
      }
      await onChangeLngI18n(lng);
    },
    [userInfo?.username, onChangeLngI18n, updateUserInfo]
  );

  const list = useMemo(() => {
    return Object.entries(langMap).map(([key, lang]) => ({
      label: (
        <Flex alignItems={'center'}>
          <MyIcon borderRadius={'0'} mr={2} name={lang.avatar as any} w={'1rem'} />
          <Box>{lang.label}</Box>
        </Flex>
      ),
      value: key
    }));
  }, []);

  return (
    <MySelect
      value={i18n.language}
      list={list}
      onChange={(val: any) => {
        const lang = val;
        onChangeLng(lang);
      }}
    />
  );
};

export default I18nLngSelector;
