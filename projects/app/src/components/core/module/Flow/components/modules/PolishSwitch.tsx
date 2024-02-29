import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { Box, Flex, Switch, type SwitchProps } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';

const PolishSwitch = (props: SwitchProps) => {
  const { t } = useTranslation();
  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/polish'} mr={2} w={'20px'} />
      <Box>{t('core.app.Ai Polish')}</Box>
      <MyTooltip label={t('core.app.Ai Polish Tip')} forceShow>
        <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
      </MyTooltip>
      <Box flex={1} />
      <Switch {...props} />
    </Flex>
  );
};

export default PolishSwitch;
