import { WorkflowToolResponseBox } from '../../../components/WholeResponseModal/WorkflowToolResponseBox';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { useTranslation } from 'next-i18next';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const RenderResponseDetail = () => {
  const { t } = useTranslation();

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const isChatting = useContextSelector(PluginRunContext, (v) => v.isChatting);

  // 流式响应可能更新记录对象本身，直接读取最新的 AI 记录，避免按数组引用缓存旧结果。
  const aiRecord = [...chatRecords].reverse().find((item) => item.obj === ChatRoleEnum.AI);
  const responseData = aiRecord?.responseData ?? [];

  return isChatting ? (
    <>{t('chat:in_progress')}</>
  ) : (
    <>
      {responseData.length > 0 ? (
        <WorkflowToolResponseBox response={responseData} dataId={aiRecord?.dataId} />
      ) : (
        <EmptyTip text={t('chat:response.no_workflow_response')} />
      )}
    </>
  );
};

export default RenderResponseDetail;
