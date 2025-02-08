import { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import React, { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { ComponentRef as ChatComponentRef } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { useForm, UseFormReturn } from 'react-hook-form';
import { defaultChatData } from '@/global/core/chat/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppChatConfigType, VariableItemType } from '@fastgpt/global/core/app/type';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

type ContextProps = {
  showRouteToAppDetail: boolean;
  showRouteToDatasetDetail: boolean;
  isShowReadRawSource: boolean;
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
  showNodeStatus
}: {
  children: ReactNode;
} & ContextProps) => {
  const ChatBoxRef = useRef<ChatComponentRef>(null);
  const variablesForm = useForm<ChatBoxInputFormType>();

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
      showNodeStatus
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
    showNodeStatus
  ]);

  return <ChatItemContext.Provider value={contextValue}>{children}</ChatItemContext.Provider>;
};

export default ChatItemContextProvider;
