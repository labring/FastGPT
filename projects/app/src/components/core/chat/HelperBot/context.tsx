import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import React, { useState, type ReactNode } from 'react';
import { createContext } from 'use-context-selector';
import {
  HelperBotTypeEnum,
  type HelperBotTypeEnumType,
  type TopAgentParamsType
} from '@fastgpt/global/core/chat/helperBot/type';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import type { TopAgentFormDataType } from '@fastgpt/service/core/chat/HelperBot/dispatch/topAgent/type';

export type HelperBotProps = {
  emptyDom?: ReactNode;
  fileSelectConfig?: AppFileSelectConfigType;
} & {
  type: HelperBotTypeEnumType;
  metadata: TopAgentParamsType;
  onApply: (e: TopAgentFormDataType) => void;
};
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
