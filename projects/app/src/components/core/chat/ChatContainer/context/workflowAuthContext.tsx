import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { createContext } from 'use-context-selector';

type WorkflowAuthContextType = {
  outLinkAuthData: OutLinkChatAuthProps;
  appId: string;
  chatId: string;
};

export const WorkflowAuthContext = createContext<WorkflowAuthContextType>({
  outLinkAuthData: {},
  appId: '',
  chatId: ''
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
  const value = useMemoEnhance(
    () => ({
      outLinkAuthData,
      appId,
      chatId
    }),
    [outLinkAuthData, appId, chatId]
  );

  return <WorkflowAuthContext.Provider value={value}>{children}</WorkflowAuthContext.Provider>;
};
