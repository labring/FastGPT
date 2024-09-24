import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PluginRunBoxTabEnum } from './PluginRunBox/constants';
import {
  ChatBoxInputFormType,
  ComponentRef as ChatComponentRef,
  SendPromptFnType
} from './ChatBox/type';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getChatRecords } from '@/web/core/chat/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { GetChatRecordsProps } from '@/global/core/chat/api';

export const useChat = () => {
  const ChatBoxRef = useRef<ChatComponentRef>(null);
  const variablesForm = useForm<ChatBoxInputFormType>();
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

  const clearChatRecords = useCallback(() => {
    const data = variablesForm.getValues();
    for (const key in data) {
      variablesForm.setValue(key, '');
    }

    ChatBoxRef.current?.restartChat?.();
  }, [variablesForm]);

  const useChatPagination = useCallback((params: GetChatRecordsProps) => {
    return usePagination<ChatSiteItemType>({
      api: async (data) => {
        const res = await getChatRecords(data);

        // First load scroll to bottom
        if (res.pageNum === 1) {
          function scrollToBottom() {
            requestAnimationFrame(
              ChatBoxRef?.current ? () => ChatBoxRef?.current?.scrollToBottom?.() : scrollToBottom
            );
          }
          scrollToBottom();
        }

        return {
          ...res,
          data: res.data.map((item) => ({
            ...item,
            dataId: item.dataId || getNanoid(),
            status: ChatStatusEnum.finish
          }))
        };
      },
      params,
      pageSize: 10,
      type: 'scroll',
      refreshDeps: [params],
      scrollLoadType: 'top'
    });
  }, []);

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
