import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import React, { type ReactNode } from 'react';
import { createContext } from 'use-context-selector';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import type { TopAgentParamsType } from '@fastgpt/global/core/chat/helperBot/topAgent/type';
import { type AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config';
import type { TopAgentFormDataType } from '@fastgpt/service/core/chat/HelperBot/dispatch/topAgent/type';
import type {
  GeneratedSkillResultType,
  SkillAgentParamsType
} from '@fastgpt/global/core/chat/helperBot/skillAgent/type';

export type HelperBotRefType = {
  restartChat: () => void;
};
export type HelperBotProps = {
  emptyDom?: ReactNode;
  fileSelectConfig?: AppFileSelectConfigType;
  ChatBoxRef: React.ForwardedRef<HelperBotRefType>;
} & (
  | {
      type: typeof HelperBotTypeEnum.topAgent;
      metadata: TopAgentParamsType;
      onApply: (e: TopAgentFormDataType) => void;
    }
  | {
      type: typeof HelperBotTypeEnum.skillAgent;
      metadata: SkillAgentParamsType;
      onApply: (e: GeneratedSkillResultType) => void;
    }
);
type HelperBotContextType = HelperBotProps & {};

export const HelperBotContext = createContext<HelperBotContextType>({
  type: HelperBotTypeEnum.topAgent,
  ChatBoxRef: null,
  metadata: {
    role: '',
    taskObject: '',
    selectedTools: [],
    selectedDatasets: [],
    fileUpload: false
  },
  onApply: function (e): void {
    throw new Error('Function not implemented.');
  }
});

const HelperBotContextProvider = ({
  children,
  ...params
}: { children: ReactNode } & HelperBotProps) => {
  const contextValue: HelperBotContextType = useMemoEnhance(() => params, [params]);
  return <HelperBotContext.Provider value={contextValue}>{children}</HelperBotContext.Provider>;
};
export default HelperBotContextProvider;
