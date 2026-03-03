import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useState } from 'react';
import { createContext } from 'use-context-selector';

type WorkflowRuntimeContextType = {
  outLinkAuthData: OutLinkChatAuthProps;
  appId: string;
  chatId: string;

  fileUploading: boolean;
  setFileUploadingCount: React.Dispatch<React.SetStateAction<number>>;
};

export const WorkflowRuntimeContext = createContext<WorkflowRuntimeContextType>({
  outLinkAuthData: {},
  appId: '',
  chatId: '',
  fileUploading: false,
  setFileUploadingCount: () => {}
});

export const WorkflowRuntimeContextProvider = ({
  appId,
  chatId,
  outLinkAuthData,
  children
}: {
  appId: string;
  chatId: string;
  outLinkAuthData: OutLinkChatAuthProps;
  children: React.ReactNode;
}) => {
  const [fileUploadingCount, setFileUploadingCount] = useState<number>(0);
  const fileUploading = fileUploadingCount > 0;

  const value = useMemoEnhance(
    () => ({
      outLinkAuthData,
      appId,
      chatId,
      fileUploading,
      setFileUploadingCount
    }),
    [outLinkAuthData, appId, chatId, fileUploading, setFileUploadingCount]
  );

  return (
    <WorkflowRuntimeContext.Provider value={value}>{children}</WorkflowRuntimeContext.Provider>
  );
};
