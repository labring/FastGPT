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
import { getChatRecords } from '@/web/core/chat/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { getPaginationRecordsBody } from '@/pages/api/core/chat/getPaginationRecords';
import { GetChatTypeEnum } from '@/global/core/chat/constants';

export const useChat = (params?: { chatId?: string; appId: string; type?: GetChatTypeEnum }) => {
  const ChatBoxRef = useRef<ChatComponentRef>(null);
  const variablesForm = useForm<ChatBoxInputFormType>();
  // plugin
  const [pluginRunTab, setPluginRunTab] = useState<PluginRunBoxTabEnum>(PluginRunBoxTabEnum.input);

  const resetVariables = useCallback(
    (props?: { variables?: Record<string, any> }) => {
      const { variables = {} } = props || {};

      // Reset to empty input
      const data = variablesForm.getValues();

      // Reset the old variables to empty
      const resetVariables: Record<string, any> = {};
      for (const key in data.variables) {
        resetVariables[key] = (() => {
          if (Array.isArray(data.variables[key])) {
            return [];
          }
          return '';
        })();
      }

      variablesForm.reset({
        ...data,
        variables: {
          ...resetVariables,
          ...variables
        }
      });
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

  const {
    data: chatRecords,
    ScrollData,
    setData: setChatRecords,
    total: totalRecordsCount
  } = useScrollPagination(
    async (data: getPaginationRecordsBody): Promise<PaginationResponse<ChatSiteItemType>> => {
      const res = await getChatRecords(data);

      // First load scroll to bottom
      if (data.offset === 0) {
        function scrollToBottom() {
          requestAnimationFrame(
            ChatBoxRef?.current ? () => ChatBoxRef?.current?.scrollToBottom?.() : scrollToBottom
          );
        }
        scrollToBottom();
      }

      return {
        ...res,
        list: res.list.map((item) => ({
          ...item,
          dataId: item.dataId || getNanoid(),
          status: ChatStatusEnum.finish
        }))
      };
    },
    {
      pageSize: 10,
      refreshDeps: [params],
      params,
      scrollLoadType: 'top'
    }
  );

  return {
    ChatBoxRef,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    clearChatRecords,
    resetVariables,
    chatRecords,
    ScrollData,
    setChatRecords,
    totalRecordsCount
  };
};

export const onSendPrompt: SendPromptFnType = (e) => eventBus.emit(EventNameEnum.sendQuestion, e);
