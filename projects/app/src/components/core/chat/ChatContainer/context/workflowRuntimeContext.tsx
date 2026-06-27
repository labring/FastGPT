import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { getChatSourceKey, type ChatSourceTarget } from '@/web/core/chat/utils';

type WorkflowRuntimeContextType = {
  outLinkAuthData: OutLinkChatAuthProps;
  /** 标准内部 chat target。ChatBox 终态应优先消费它。 */
  sourceTarget: ChatSourceTarget;
  /** 前端运行时状态隔离 key：`${sourceType}:${sourceId}`。 */
  sourceKey: string;
  chatId: string;

  fileUploading: boolean;
  setFileUploadingCount: React.Dispatch<React.SetStateAction<number>>;
};

export const WorkflowRuntimeContext = createContext<WorkflowRuntimeContextType>({
  outLinkAuthData: {},
  sourceTarget: {
    sourceType: 'app' as ChatSourceTarget['sourceType'],
    sourceId: ''
  },
  sourceKey: '',
  chatId: '',
  fileUploading: false,
  setFileUploadingCount: () => {}
});

export const WorkflowRuntimeContextProvider = ({
  sourceTarget,
  chatId,
  outLinkAuthData,
  children
}: {
  sourceTarget: ChatSourceTarget;
  chatId: string;
  outLinkAuthData: OutLinkChatAuthProps;
  children: React.ReactNode;
}) => {
  const [fileUploadingCount, setFileUploadingCount] = useState<number>(0);
  const fileUploading = fileUploadingCount > 0;
  const sourceKey = useMemo(() => getChatSourceKey(sourceTarget), [sourceTarget]);

  const value = useMemoEnhance(
    () => ({
      outLinkAuthData,
      sourceTarget,
      sourceKey,
      chatId,
      fileUploading,
      setFileUploadingCount
    }),
    [outLinkAuthData, sourceTarget, sourceKey, chatId, fileUploading, setFileUploadingCount]
  );

  return (
    <WorkflowRuntimeContext.Provider value={value}>{children}</WorkflowRuntimeContext.Provider>
  );
};
