import { ChatHistoryItemResType, ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PluginRunBoxTabEnum } from './PluginRunBox/constants';
import { ComponentRef as ChatComponentRef } from './ChatBox/type';
import { getChatResData } from '@/web/core/chat/api';

export const useChat = () => {
  const ChatBoxRef = useRef<ChatComponentRef>(null);

  const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([]);
  const variablesForm = useForm();
  // plugin
  const [pluginRunTab, setPluginRunTab] = useState<PluginRunBoxTabEnum>(PluginRunBoxTabEnum.input);

  const resetChatRecords = useCallback(
    (props?: { records?: ChatSiteItemType[]; variables?: Record<string, any> }) => {
      const { records = [], variables = {} } = props || {};

      setChatRecords(records);

      // Reset to empty input
      const data = variablesForm.getValues();
      for (const key in data) {
        data[key] = '';
      }

      variablesForm.reset({
        ...data,
        ...variables
      });

      setTimeout(
        () => {
          ChatBoxRef.current?.restartChat?.();
        },
        ChatBoxRef.current?.restartChat ? 0 : 500
      );
    },
    [variablesForm, setChatRecords]
  );

  const clearChatRecords = useCallback(() => {
    setChatRecords([]);

    const data = variablesForm.getValues();
    for (const key in data) {
      variablesForm.setValue(key, '');
    }

    ChatBoxRef.current?.restartChat?.();
  }, [variablesForm]);
  const getHistoryResponseData = useCallback(
    async ({ appId, chatId, dataId }: { appId: string; chatId?: string; dataId: string }) => {
      let resData: ChatHistoryItemResType[] = [];
      const aimItem = chatRecords.find((item) => item.dataId === dataId) as ChatSiteItemType;
      if (!!aimItem?.responseData || !chatId) {
        resData = aimItem.responseData || [];
      } else {
        resData = await getChatResData({ appId, chatId, dataId });
        setChatRecords((state) => {
          const index = state.findIndex((item) => item.dataId === dataId);
          if (index > -1) state[index].responseData = resData;
          return [...state];
        });
      }

      return resData;
    },
    [chatRecords]
  );
  return {
    ChatBoxRef,
    chatRecords,
    setChatRecords,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    clearChatRecords,
    resetChatRecords,
    getHistoryResponseData
  };
};
