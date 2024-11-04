import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Flex, Switch, type SwitchProps } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

// question generator switch
const QGSwitch = (props: SwitchProps) => {
  const { t } = useTranslation();
  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/chat/QGFill'} mr={2} w={'20px'} />
      <FormLabel color={'myGray.600'}>{t('common:core.app.Question Guide')}</FormLabel>
      <ChatFunctionTip type={'nextQuestion'} />
      <Box flex={1} />
      <Switch {...props} />
    </Flex>
  );
};

export default QGSwitch;
