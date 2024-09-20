import React, { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { PluginRunBoxProps } from './type';
import {
  AIChatItemValueItemType,
  ChatSiteItemType,
  RuntimeUserPromptType
} from '@fastgpt/global/core/chat/type';
import { FieldValues, useForm } from 'react-hook-form';
import { PluginRunBoxTabEnum } from './constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { generatingMessageProps } from '../type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { useTranslation } from 'next-i18next';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ChatBoxInputFormType, UserInputFileItemType } from '../ChatBox/type';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getPluginRunUserQuery } from '@fastgpt/global/core/workflow/utils';

type PluginRunContextType = OutLinkChatAuthProps &
  PluginRunBoxProps & {
    isChatting: boolean;
    onSubmit: (e: ChatBoxInputFormType, files?: UserInputFileItemType[]) => Promise<any>;
    outLinkAuthData: OutLinkChatAuthProps;
    restartInputStore?: ChatBoxInputFormType;
    setRestartInputStore: React.Dispatch<React.SetStateAction<ChatBoxInputFormType | undefined>>;
  };

export const PluginRunContext = createContext<PluginRunContextType>({
  pluginInputs: [],
  histories: [],
  setHistories: function (value: React.SetStateAction<ChatSiteItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  appId: '',
  tab: PluginRunBoxTabEnum.input,
  setTab: function (value: React.SetStateAction<PluginRunBoxTabEnum>): void {
    throw new Error('Function not implemented.');
  },
  isChatting: false,
  onSubmit: function (e: FieldValues): Promise<any> {
    throw new Error('Function not implemented.');
  },
  outLinkAuthData: {},
  //@ts-ignore
  variablesForm: undefined
});

const PluginRunContextProvider = ({
  shareId,
  outLinkUid,
  teamId,
  teamToken,
  children,
  ...props
}: PluginRunBoxProps & { children: ReactNode }) => {
  const { pluginInputs, onStartChat, setHistories, histories, setTab } = props;

  const [restartInputStore, setRestartInputStore] = useState<ChatBoxInputFormType>();

  const { toast } = useToast();
  const chatController = useRef(new AbortController());
  const { t } = useTranslation();
  /* Abort chat completions, questionGuide */
  const abortRequest = useCallback(() => {
    chatController.current?.abort('stop');
  }, []);

  const outLinkAuthData = useMemo(
    () => ({
      shareId,
      outLinkUid,
      teamId,
      teamToken
    }),
    [shareId, outLinkUid, teamId, teamToken]
  );

  const variablesForm = useForm<ChatBoxInputFormType>({
    defaultValues: {
      files: []
    }
  });

  const generatingMessage = useCallback(
    ({ event, text = '', status, name, tool }: generatingMessageProps) => {
      setHistories((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1 || item.obj !== ChatRoleEnum.AI) return item;

          const lastValue: AIChatItemValueItemType = JSON.parse(
            JSON.stringify(item.value[item.value.length - 1])
          );

          if (event === SseResponseEventEnum.flowNodeStatus && status) {
            return {
              ...item,
              status,
              moduleName: name
            };
          } else if (
            (event === SseResponseEventEnum.answer || event === SseResponseEventEnum.fastAnswer) &&
            text
          ) {
            if (!lastValue || !lastValue.text) {
              const newValue: AIChatItemValueItemType = {
                type: ChatItemValueTypeEnum.text,
                text: {
                  content: text
                }
              };
              return {
                ...item,
                value: item.value.concat(newValue)
              };
            } else {
              lastValue.text.content += text;
              return {
                ...item,
                value: item.value.slice(0, -1).concat(lastValue)
              };
            }
          } else if (event === SseResponseEventEnum.toolCall && tool) {
            const val: AIChatItemValueItemType = {
              type: ChatItemValueTypeEnum.tool,
              tools: [tool]
            };
            return {
              ...item,
              value: item.value.concat(val)
            };
          } else if (
            event === SseResponseEventEnum.toolParams &&
            tool &&
            lastValue.type === ChatItemValueTypeEnum.tool &&
            lastValue?.tools
          ) {
            lastValue.tools = lastValue.tools.map((item) => {
              if (item.id === tool.id) {
                item.params += tool.params;
              }
              return item;
            });
            return {
              ...item,
              value: item.value.slice(0, -1).concat(lastValue)
            };
          } else if (event === SseResponseEventEnum.toolResponse && tool) {
            // replace tool response
            return {
              ...item,
              value: item.value.map((val) => {
                if (val.type === ChatItemValueTypeEnum.tool && val.tools) {
                  const tools = val.tools.map((item) =>
                    item.id === tool.id ? { ...item, response: tool.response } : item
                  );
                  return {
                    ...val,
                    tools
                  };
                }
                return val;
              })
            };
          }

          return item;
        })
      );
    },
    [setHistories]
  );

  const isChatting = useMemo(
    () => histories[histories.length - 1] && histories[histories.length - 1]?.status !== 'finish',
    [histories]
  );

  const { runAsync: onSubmit } = useRequest2(
    async (e: ChatBoxInputFormType, files?: UserInputFileItemType[]) => {
      if (!onStartChat) return;
      if (isChatting) {
        toast({
          title: t('chat:is_chatting'),
          status: 'warning'
        });
        return;
      }

      // reset controller
      abortRequest();
      const abortSignal = new AbortController();
      chatController.current = abortSignal;

      setHistories([
        {
          ...getPluginRunUserQuery({
            pluginInputs,
            variables: e,
            files: files as RuntimeUserPromptType['files']
          }),
          status: 'finish'
        },
        {
          dataId: getNanoid(24),
          obj: ChatRoleEnum.AI,
          value: [
            {
              type: ChatItemValueTypeEnum.text,
              text: {
                content: ''
              }
            }
          ],
          status: 'loading'
        }
      ]);
      setTab(PluginRunBoxTabEnum.output);

      const messages = chats2GPTMessages({
        messages: [
          {
            dataId: getNanoid(24),
            obj: ChatRoleEnum.Human,
            value: []
          }
        ],
        reserveId: true
      });

      try {
        const { responseData } = await onStartChat({
          messages: messages,
          controller: chatController.current,
          generatingMessage,
          variables: e
        });

        setHistories((state) =>
          state.map((item, index) => {
            if (index !== state.length - 1) return item;
            return {
              ...item,
              status: 'finish',
              responseData
            };
          })
        );
      } catch (err: any) {
        toast({ title: err.message, status: 'error' });
        setHistories((state) =>
          state.map((item, index) => {
            if (index !== state.length - 1) return item;
            return {
              ...item,
              status: 'finish'
            };
          })
        );
      }
    }
  );

  const contextValue: PluginRunContextType = {
    ...props,
    isChatting,
    onSubmit,
    outLinkAuthData,
    variablesForm,
    restartInputStore,
    setRestartInputStore
  };
  return <PluginRunContext.Provider value={contextValue}>{children}</PluginRunContext.Provider>;
};

export default PluginRunContextProvider;
