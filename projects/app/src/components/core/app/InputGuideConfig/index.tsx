import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';
import type { ChatInputGuideConfigType } from '@fastgpt/global/core/app/type';
import { getCountChatInputGuideTotal } from '@/web/core/chat/inputGuide/api';
import { useQuery } from '@tanstack/react-query';
import { defaultChatInputGuideConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from '../Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import InputGuideConfigModal from './InputGuideConfigModal';
import dynamic from 'next/dynamic';

const LexiconConfigModal = dynamic(() => import('./LexiconConfigModal'), {
  ssr: false
});

type InputGuideConfigProps = {
  appId: string;
  value?: ChatInputGuideConfigType;
  onChange: (e: ChatInputGuideConfigType) => void;
};

const InputGuideConfig = ({
  appId,
  value = defaultChatInputGuideConfig,
  onChange
}: InputGuideConfigProps) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isOpenLexiconConfig,
    onOpen: onOpenLexiconConfig,
    onClose: onCloseLexiconConfig
  } = useDisclosure();

  const { data } = useQuery(
    ['chatInputGuideTotal', appId, isOpenLexiconConfig],
    () => getCountChatInputGuideTotal({ appId }),
    {
      enabled: !!appId
    }
  );
  const total = data?.total ?? 0;
  const statusText = value.open
    ? t('common:core.app.whisper.Open')
    : t('common:core.app.whisper.Close');

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/inputGuides'} mr={2} w={'20px'} />
      <Flex alignItems={'center'}>
        <FormLabel>{t('app:input_guide')}</FormLabel>
        <ChatFunctionTip type={'inputGuide'} />
      </Flex>
      <Box flex={1} />
      <MyTooltip label={t('app:config_input_guide')}>
        <Button
          variant={'transparentBase'}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          color={'myGray.600'}
          onClick={onOpen}
        >
          {statusText}
        </Button>
      </MyTooltip>

      <InputGuideConfigModal
        isOpen={isOpen}
        value={value}
        total={total}
        onClose={onClose}
        onChange={onChange}
        onOpenLexiconConfig={onOpenLexiconConfig}
      />

      {isOpenLexiconConfig && <LexiconConfigModal appId={appId} onClose={onCloseLexiconConfig} />}
    </Flex>
  );
};

export default React.memo(InputGuideConfig);
