import { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { ComponentRef as ChatComponentRef } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { useForm, UseFormReturn } from 'react-hook-form';
import { defaultChatData } from '@/global/core/chat/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppChatConfigType, VariableItemType } from '@fastgpt/global/core/app/type';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type ContextProps = {
  showRouteToAppDetail: boolean;
  showRouteToDatasetDetail: boolean;
  isShowReadRawSource: boolean;
  // isShowFullText: boolean;
  showNodeStatus: boolean;
};
type ChatBoxDataType = {
  appId: string;
  title?: string;
  userAvatar?: string;

  app: {
    chatConfig?: AppChatConfigType;
    name: string;
    avatar: string;
    type: `${AppTypeEnum}`;
    pluginInputs: FlowNodeInputItemType[];
    chatModels?: string[];
  };
};

export type GetQuoteDataBasicProps = {
  appId: string;
  chatId: string;
  chatItemDataId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
};
// 获取单个集合引用
export type GetCollectionQuoteDataProps = GetQuoteDataBasicProps & {
  collectionId: string;
  sourceId: string;
  sourceName: string;
  datasetId: string;
};
export type GetAllQuoteDataProps = GetQuoteDataBasicProps & {
  collectionIdList: string[];
  sourceId?: string;
  sourceName?: string;
};
export type GetQuoteProps = GetAllQuoteDataProps | GetCollectionQuoteDataProps;

export type QuoteDataType = {
  rawSearch: SearchDataResponseItemType[];
  metadata: GetQuoteProps;
};

type ChatItemContextType = {
  ChatBoxRef: React.RefObject<ChatComponentRef> | null;
  variablesForm: UseFormReturn<ChatBoxInputFormType, any>;
  pluginRunTab: PluginRunBoxTabEnum;
  setPluginRunTab: React.Dispatch<React.SetStateAction<PluginRunBoxTabEnum>>;
  resetVariables: (props?: {
    variables?: Record<string, any>;
    variableList?: VariableItemType[];
  }) => void;
  clearChatRecords: () => void;
  chatBoxData: ChatBoxDataType;
  setChatBoxData: React.Dispatch<React.SetStateAction<ChatBoxDataType>>;
  isPlugin: boolean;

  quoteData?: QuoteDataType;
  setQuoteData: React.Dispatch<React.SetStateAction<QuoteDataType | undefined>>;
  isVariableVisible: boolean;
  setIsVariableVisible: React.Dispatch<React.SetStateAction<boolean>>;
} & ContextProps;

export const ChatItemContext = createContext<ChatItemContextType>({
  ChatBoxRef: null,
  // @ts-ignore
  variablesForm: undefined,
  pluginRunTab: PluginRunBoxTabEnum.input,
  setPluginRunTab: function (value: React.SetStateAction<PluginRunBoxTabEnum>): void {
    throw new Error('Function not implemented.');
  },
  resetVariables: function (props?: {
    variables?: Record<string, any>;
    variableList?: VariableItemType[];
  }): void {
    throw new Error('Function not implemented.');
  },
  clearChatRecords: function (): void {
    throw new Error('Function not implemented.');
  },

  quoteData: undefined,
  setQuoteData: function (value: React.SetStateAction<QuoteDataType | undefined>): void {
    throw new Error('Function not implemented.');
  },
  isVariableVisible: true,
  setIsVariableVisible: function (value: React.SetStateAction<boolean>): void {
    throw new Error('Function not implemented.');
  }
});

/* 
    Chat 对象的上下文
*/
const ChatItemContextProvider = ({
  children,
  showRouteToAppDetail,
  showRouteToDatasetDetail,
  isShowReadRawSource,
  // isShowFullText,
  showNodeStatus
}: {
  children: ReactNode;
} & ContextProps) => {
  const ChatBoxRef = useRef<ChatComponentRef>(null);
  const variablesForm = useForm<ChatBoxInputFormType>();
  const [quoteData, setQuoteData] = useState<QuoteDataType>();
  const [isVariableVisible, setIsVariableVisible] = useState(true);

  const [chatBoxData, setChatBoxData] = useState<ChatBoxDataType>({
    ...defaultChatData
  });

  const isPlugin = chatBoxData.app.type === AppTypeEnum.plugin;

  // plugin
  const [pluginRunTab, setPluginRunTab] = useState<PluginRunBoxTabEnum>(PluginRunBoxTabEnum.input);

  const resetVariables = useCallback(
    (props?: { variables?: Record<string, any>; variableList?: VariableItemType[] }) => {
      const { variables, variableList = [] } = props || {};

      let newVariableValue: Record<string, any> = {};
      if (variables) {
        variableList.forEach((item) => {
          newVariableValue[item.key] = variables[item.key];
        });
      } else {
        variableList.forEach((item) => {
          newVariableValue[item.key] = item.defaultValue;
        });
      }

      variablesForm.setValue('variables', newVariableValue);
    },
    [variablesForm]
  );

  const clearChatRecords = useCallback(() => {
    const data = variablesForm.getValues();
    for (const key in data.variables) {
      variablesForm.setValue(`variables.${key}`, '');
    }

    ChatBoxRef.current?.restartChat?.();
  }, [variablesForm]);

  const contextValue = useMemo(() => {
    return {
      chatBoxData,
      setChatBoxData,
      isPlugin,
      ChatBoxRef,
      variablesForm,
      pluginRunTab,
      setPluginRunTab,
      resetVariables,
      clearChatRecords,
      showRouteToAppDetail,
      showRouteToDatasetDetail,
      isShowReadRawSource,
      // isShowFullText,
      showNodeStatus,

      quoteData,
      setQuoteData,
      isVariableVisible,
      setIsVariableVisible
    };
  }, [
    chatBoxData,
    isPlugin,
    variablesForm,
    pluginRunTab,
    resetVariables,
    clearChatRecords,
    showRouteToAppDetail,
    showRouteToDatasetDetail,
    isShowReadRawSource,
    // isShowFullText,
    showNodeStatus,
    quoteData,
    setQuoteData,
    isVariableVisible,
    setIsVariableVisible
  ]);

  return <ChatItemContext.Provider value={contextValue}>{children}</ChatItemContext.Provider>;
};

export default ChatItemContextProvider;
