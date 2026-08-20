import { useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';
import type { ChatInputGuideConfigType } from '@fastgpt/global/core/app/type';
import { getCountChatInputGuideTotal } from '@/web/core/chat/inputGuide/api';
import { useQuery } from '@tanstack/react-query';
import { defaultChatInputGuideConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from '../Tip';
import InputGuideConfigModal from './InputGuideConfigModal';
import dynamic from 'next/dynamic';
import AppConfigItem, { AppConfigItemAction } from '../AppConfigItem';

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
    <>
      <AppConfigItem
        icon={'core/app/inputGuides'}
        label={t('app:input_guide')}
        tip={<ChatFunctionTip type={'inputGuide'} />}
        action={
          <AppConfigItemAction tooltip={t('app:config_input_guide')} onClick={onOpen}>
            {statusText}
          </AppConfigItemAction>
        }
      />

      <InputGuideConfigModal
        isOpen={isOpen}
        value={value}
        total={total}
        onClose={onClose}
        onChange={onChange}
        onOpenLexiconConfig={onOpenLexiconConfig}
      />

      {isOpenLexiconConfig && <LexiconConfigModal appId={appId} onClose={onCloseLexiconConfig} />}
    </>
  );
};

export default React.memo(InputGuideConfig);
