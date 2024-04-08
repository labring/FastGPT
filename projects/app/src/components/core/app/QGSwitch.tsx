import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { Box, Flex, Switch, type SwitchProps } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';

// question generator switch
const QGSwitch = (props: SwitchProps) => {
  const { t } = useTranslation();
  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/chat/QGFill'} mr={2} w={'20px'} />
      <Box>{t('core.app.Question Guide')}</Box>
      <MyTooltip label={t('core.app.Question Guide Tip')} forceShow>
        <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
      </MyTooltip>
      <Box flex={1} />
      <Switch {...props} />
    </Flex>
  );
};

export default QGSwitch;
