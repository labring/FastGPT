import { ResponseBox } from '../../../components/WholeResponseModal';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const RenderResponseDetail = () => {
  const { t } = useTranslation();

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const isChatting = useContextSelector(PluginRunContext, (v) => v.isChatting);

  const aiRecord = useMemo(
    () => [...chatRecords].reverse().find((item) => item.obj === ChatRoleEnum.AI),
    [chatRecords]
  );
  const responseData = aiRecord?.responseData || [];

  return isChatting ? (
    <>{t('chat:in_progress')}</>
  ) : (
    <Box flex={'1 0 0'} h={'100%'} overflow={'auto'}>
      {responseData.length > 0 ? (
        <ResponseBox useMobile={true} response={responseData} dataId={aiRecord?.dataId} />
      ) : (
        <EmptyTip text={t('chat:response.no_workflow_response')} />
      )}
    </Box>
  );
};

export default RenderResponseDetail;
