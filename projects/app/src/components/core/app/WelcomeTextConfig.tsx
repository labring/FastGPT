import { Box, Flex, TextareaProps } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ChatFunctionTip from './Tip';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { useTranslation } from 'next-i18next';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const WelcomeTextConfig = (props: TextareaProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Flex alignItems={'center'}>
        <MyIcon name={'core/app/simpleMode/chat'} w={'20px'} />
        <FormLabel ml={2}>{t('common:core.app.Welcome Text')}</FormLabel>
        <ChatFunctionTip type={'welcome'} />
      </Flex>
      <MyTextarea
        iconSrc={'core/app/simpleMode/chat'}
        title={t('common:core.app.Welcome Text')}
        mt={2}
        rows={6}
        fontSize={'sm'}
        bg={'myGray.50'}
        placeholder={t('common:core.app.tip.welcomeTextTip')}
        {...props}
      />
    </>
  );
};

export default React.memo(WelcomeTextConfig);
