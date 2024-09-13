import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PluginRunBoxTabEnum } from './PluginRunBox/constants';
import {
  ChatBoxInputFormType,
  ComponentRef as ChatComponentRef,
  SendPromptFnType
} from './ChatBox/type';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { PagingData } from '@/types';
import { getChatRecords } from '@/web/core/chat/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { GetChatRecordsProps } from '@/global/core/chat/api';

export const useChat = () => {
  const ChatBoxRef = useRef<ChatComponentRef>(null);
  const variablesForm = useForm();
  // plugin
  const [pluginRunTab, setPluginRunTab] = useState<PluginRunBoxTabEnum>(PluginRunBoxTabEnum.input);

  const resetVariables = useCallback(
    (props?: { variables?: Record<string, any> }) => {
      const { variables = {} } = props || {};

      // Reset to empty input
      const data = variablesForm.getValues();
      for (const key in data) {
        data[key] = '';
      }

      variablesForm.reset({
        ...data,
        ...variables
      });
    },
    [variablesForm]
  );

  const useChatPagination = (params: GetChatRecordsProps) => {
    const { data, ScrollData, isLoading, setData, refresh, getData } = usePagination({
      api: async (data): Promise<PagingData<ChatSiteItemType>> => {
        const res = await getChatRecords(data);

        return {
          ...res,
          data: res.data.map((item) => ({
            ...item,
            dataId: item.dataId || getNanoid(),
            status: ChatStatusEnum.finish
          }))
        };
      },
      showTextTip: false,
      params,
      pageSize: 10,
      type: 'scroll',
      refreshDeps: [...Object.values(params)],
      loadType: 'top'
    });

    return {
      data,
      ScrollData,
      isLoading,
      setData,
      refresh,
      getData
    };
  };
  const clearChatRecords = useCallback(() => {
    const data = variablesForm.getValues();
    for (const key in data) {
      variablesForm.setValue(key, '');
    }

    ChatBoxRef.current?.restartChat?.();
  }, [variablesForm]);
  return {
    ChatBoxRef,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    clearChatRecords,
    resetVariables,
    useChatPagination
  };
};

export const onSendPrompt: SendPromptFnType = (e) => eventBus.emit(EventNameEnum.sendQuestion, e);
