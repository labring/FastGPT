import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { getChatSourceKey, type ChatSourceTarget } from '@/web/core/chat/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

type WorkflowRuntimeContextType = {
  outLinkAuthData: OutLinkChatAuthProps;
  /** 标准内部 chat target。ChatBox 终态应优先消费它。 */
  sourceTarget: ChatSourceTarget;
  /** 前端运行时状态隔离 key：`${sourceType}:${sourceId}`。 */
  sourceKey: string;
  /** 只有真实 App Chat 才有值；App-only 能力（TTS/Input guide/沙盒编辑器）必须使用它。 */
  appId?: string;
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
  appId: undefined,
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
  const resolvedAppId = useMemo(
    () => (sourceTarget.sourceType === ChatSourceTypeEnum.app ? sourceTarget.sourceId : undefined),
    [sourceTarget]
  );

  const value = useMemoEnhance(
    () => ({
      outLinkAuthData,
      sourceTarget,
      sourceKey,
      appId: resolvedAppId,
      chatId,
      fileUploading,
      setFileUploadingCount
    }),
    [
      outLinkAuthData,
      sourceTarget,
      sourceKey,
      resolvedAppId,
      chatId,
      fileUploading,
      setFileUploadingCount
    ]
  );

  return (
    <WorkflowRuntimeContext.Provider value={value}>{children}</WorkflowRuntimeContext.Provider>
  );
};
