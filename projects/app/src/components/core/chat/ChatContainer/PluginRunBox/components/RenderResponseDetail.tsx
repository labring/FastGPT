import { ResponseBox } from '../../../components/WholeResponseModal';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
const RenderResponseDetail = () => {
  const { t } = useTranslation();

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const isChatting = useContextSelector(PluginRunContext, (v) => v.isChatting);

  const responseData = chatRecords?.[1]?.responseData || [];

  return isChatting ? (
    <>{t('chat:in_progress')}</>
  ) : (
    <Box flex={'1 0 0'} h={'100%'} overflow={'auto'}>
      <ResponseBox useMobile={true} response={responseData} dataId={chatRecords?.[1]?.dataId} />
    </Box>
  );
};

export default RenderResponseDetail;
