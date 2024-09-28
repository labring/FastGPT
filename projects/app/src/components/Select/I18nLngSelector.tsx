import { langMap } from '@/web/common/utils/i18n';
import { Avatar, Box, Flex } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useI18nLng } from '@fastgpt/web/hooks/useI18n';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const I18nLngSelector = () => {
  const { i18n } = useTranslation();
  const { onChangeLng } = useI18nLng();

  const list = useMemo(() => {
    return Object.entries(langMap).map(([key, lang]) => ({
      label: (
        <Flex alignItems={'center'}>
          <MyIcon borderRadius={'0'} mr={2} name={lang.avatar as any} w={'14px'} h={'9px'} />
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
      onchange={(val: any) => {
        const lang = val;
        onChangeLng(lang);
      }}
    />
  );
};

export default I18nLngSelector;
