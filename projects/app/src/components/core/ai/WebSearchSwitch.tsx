import React from 'react';
import { Flex, Switch } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useTranslation } from 'next-i18next';

/** 统一应用和工作流的元宝搜索开关；模型在开启后按需调用搜索工具。 */
const WebSearchSwitch = ({
  isChecked,
  onChange
}: {
  isChecked: boolean;
  onChange: (enabled: boolean) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex alignItems={'center'} justifyContent={'space-between'} gap={3}>
      <Flex alignItems={'center'}>
        <FormLabel>{t('app:yuanbao_web_search')}</FormLabel>
        <QuestionTip ml={1} label={t('app:yuanbao_web_search_description')} />
      </Flex>
      <Switch
        className={'nodrag'}
        aria-label={t('app:yuanbao_web_search')}
        isChecked={isChecked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </Flex>
  );
};

export default React.memo(WebSearchSwitch);
