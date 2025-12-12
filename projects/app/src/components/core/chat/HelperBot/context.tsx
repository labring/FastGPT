import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import React, { useState, type ReactNode } from 'react';
import { createContext } from 'use-context-selector';
import {
  HelperBotTypeEnum,
  type HelperBotTypeEnumType,
  type TopAgentParamsType,
  type SkillAgentParamsType
} from '@fastgpt/global/core/chat/helperBot/type';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import type { TopAgentFormDataType } from '@fastgpt/service/core/chat/HelperBot/dispatch/topAgent/type';
import type { GeneratedSkillDataType } from '@fastgpt/global/core/chat/helperBot/generatedSkill/type';

export type HelperBotProps = {
  emptyDom?: ReactNode;
  fileSelectConfig?: AppFileSelectConfigType;
} & (
  | {
      type: typeof HelperBotTypeEnum.topAgent;
      metadata: TopAgentParamsType;
      onApply: (e: TopAgentFormDataType) => void;
    }
  | {
      type: typeof HelperBotTypeEnum.skillAgent;
      metadata: SkillAgentParamsType;
      onApply: (e: GeneratedSkillDataType) => void;
    }
);
type HelperBotContextType = HelperBotProps & {};

export const HelperBotContext = createContext<HelperBotContextType>({
  type: HelperBotTypeEnum.topAgent,
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
