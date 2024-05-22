import { Box, Flex, TextareaProps } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ChatFunctionTip from './Tip';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { useTranslation } from 'next-i18next';

const WelcomeTextConfig = (props: TextareaProps) => {
  const { t } = useTranslation();
  return (
    <>
      <Flex alignItems={'center'}>
        <MyIcon name={'core/app/simpleMode/chat'} w={'20px'} />
        <Box ml={2}>{t('core.app.Welcome Text')}</Box>
        <ChatFunctionTip type={'welcome'} />
      </Flex>
      <MyTextarea
        mt={2}
        bg={'myWhite.400'}
        rows={6}
        fontSize={'sm'}
        placeholder={t('core.app.tip.welcomeTextTip')}
        {...props}
      />
    </>
  );
};

export default WelcomeTextConfig;
