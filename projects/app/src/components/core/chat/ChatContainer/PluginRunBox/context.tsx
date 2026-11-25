import React, { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import type { PluginRunBoxProps } from './type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { PluginRunBoxTabEnum } from './constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type { generatingMessageProps } from '../type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { useTranslation } from 'next-i18next';
import type { ChatBoxInputFormType } from '../ChatBox/type';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { clientGetWorkflowToolRunUserQuery } from '@/components/core/chat/ChatContainer/PluginRunBox/utils';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { toChatAuthApiTarget } from '@/web/core/chat/utils';
import {
  appendNodeResponseByParent,
  mergeNodeResponseDataByIdAndParent
} from '@fastgpt/global/core/chat/utils/mergeNode';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { isChatEntryModerationError } from '@fastgpt/global/core/chat/error';
import { WorkflowRuntimeContextProvider } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { safeAbortController } from '../ChatBox/utils/generate';

type PluginRunContextType = PluginRunBoxProps & {
  isChatting: boolean;
  onSubmit: (e: ChatBoxInputFormType) => Promise<any>;
  instruction: string;
};

export const PluginRunContext = createContext<
  Omit<PluginRunContextType, 'appId' | 'chatId' | 'outLinkAuthData'>
>({
  isChatting: false,
  onSubmit: function (): Promise<any> {
    throw new Error('Function not implemented.');
  },
  instruction: ''
});

const PluginRunContextProvider = ({
  children,
  ...props
}: PluginRunBoxProps & { children: ReactNode }) => {
  const {
    onStartChat,
    onMarkChatRead,
    onChatGenerateStatusChange,
    appId,
    chatId,
    outLinkAuthData
  } = props;

  const pluginInputs = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.pluginInputs);
  const setTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const chatConfig = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.chatConfig);

  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  const instruction = chatConfig?.instruction || '';

  const { toast } = useToast();
  const chatController = useRef(new AbortController());
  const activeTargetRef = useRef({ appId, chatId });
  useEffect(() => {
    activeTargetRef.current = { appId, chatId };
  }, [appId, chatId]);
  const { t } = useTranslation();
  /* Abort chat completions, questionGuide */
  const abortRequest = useCallback(() => {
    safeAbortController(chatController.current, 'stop');
  }, []);

  const notifyChatGenerateStatusChange = useCallback(
    (
      status: ChatGenerateStatusEnum,
      options?: {
        targetAppId?: string;
        targetChatId?: string;
        hasBeenRead?: boolean;
        title?: string;
      }
    ) => {
      const targetAppId = options?.targetAppId ?? appId;
      const targetChatId = options?.targetChatId ?? chatId;
      if (!targetAppId || !targetChatId) return;

      onChatGenerateStatusChange?.({
        sourceTarget: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: targetAppId
        },
        chatId: targetChatId,
        status,
        hasBeenRead: options?.hasBeenRead,
        title: options?.title
      });
    },
    [appId, chatId, onChatGenerateStatusChange]
  );

  const finishPluginGenerateStatus = useCallback(
    ({
      runAppId,
      targetChatId,
      runOutLinkAuthData,
      finishedInActiveChat,
      skipMarkRead = false
    }: {
      runAppId: string;
      targetChatId: string;
      runOutLinkAuthData?: PluginRunBoxProps['outLinkAuthData'];
      finishedInActiveChat: boolean;
      skipMarkRead?: boolean;
    }) => {
      if (!runAppId || !targetChatId) return;

      setChatBoxData?.((state) =>
        state.appId === runAppId && state.chatId === targetChatId
          ? {
              ...state,
              chatGenerateStatus: ChatGenerateStatusEnum.done,
              hasBeenRead: finishedInActiveChat
            }
          : state
      );

      const syncDoneStatus = (hasBeenRead: boolean) => {
        notifyChatGenerateStatusChange(ChatGenerateStatusEnum.done, {
          targetAppId: runAppId,
          targetChatId,
          hasBeenRead
        });
      };

      if (!finishedInActiveChat || skipMarkRead || !onMarkChatRead) {
        syncDoneStatus(finishedInActiveChat);
        return;
      }

      const authTarget = toChatAuthApiTarget({
        sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: runAppId },
        outLinkAuthData: runOutLinkAuthData
      });
      void onMarkChatRead({
        ...authTarget,
        chatId: targetChatId
      })
        .catch(() => {})
        .finally(() => {
          syncDoneStatus(true);
        });
    },
    [notifyChatGenerateStatusChange, onMarkChatRead, setChatBoxData]
  );

  const generatingMessage = useCallback(
    ({
      event,
      text = '',
      status,
      name,
      tool,
      nodeResponse,
      variables,
      title
    }: generatingMessageProps) => {
      const isCurrentTarget =
        activeTargetRef.current.appId === appId && activeTargetRef.current.chatId === chatId;

      if (event === SseResponseEventEnum.chatTitle && title) {
        if (isCurrentTarget) {
          setChatBoxData?.((state) =>
            state.appId === appId && state.chatId === chatId
              ? {
                  ...state,
                  title
                }
              : state
          );
        }
        notifyChatGenerateStatusChange(ChatGenerateStatusEnum.generating, {
          targetAppId: appId,
          targetChatId: chatId,
          title
        });
        return;
      }

      if (!isCurrentTarget) return;

      setChatRecords((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1 || item.obj !== ChatRoleEnum.AI) return item;

          const lastValue: AIChatItemValueItemType = JSON.parse(
            JSON.stringify(item.value[item.value.length - 1])
          );

          if (event === SseResponseEventEnum.flowNodeResponse && nodeResponse) {
            return {
              ...item,
              responseData: appendNodeResponseByParent(item.responseData, nodeResponse)
            };
          } else if (event === SseResponseEventEnum.flowNodeStatus && status) {
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
              tools: [tool]
            };
            return {
              ...item,
              value: item.value.concat(val)
            };
          } else if (event === SseResponseEventEnum.toolParams && tool && lastValue?.tools) {
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
                if (val.tools) {
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
          } else if (event === SseResponseEventEnum.updateVariables && variables) {
            resetVariables({ variables });
          }

          return item;
        })
      );
    },
    [appId, chatId, notifyChatGenerateStatusChange, resetVariables, setChatBoxData, setChatRecords]
  );

  const isChatting =
    chatRecords[chatRecords.length - 1] && chatRecords[chatRecords.length - 1]?.status !== 'finish';

  const onSubmit = useCallback(
    async ({ variables }: ChatBoxInputFormType) => {
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
      const runAppId = appId;
      const runChatId = chatId;
      const runOutLinkAuthData = outLinkAuthData;
      const humanChatItemId = getNanoid(24);
      const responseChatItemId = getNanoid(24);

      setChatRecords([
        {
          ...clientGetWorkflowToolRunUserQuery({
            pluginInputs,
            variables
          }),
          dataId: humanChatItemId,
          status: 'finish'
        },
        {
          dataId: responseChatItemId,
          obj: ChatRoleEnum.AI,
          value: [
            {
              text: {
                content: ''
              }
            }
          ],
          status: 'loading'
        }
      ]);
      setTab(PluginRunBoxTabEnum.output);
      setChatBoxData?.((state) =>
        state.appId === runAppId && state.chatId === runChatId
          ? {
              ...state,
              chatGenerateStatus: ChatGenerateStatusEnum.generating,
              hasBeenRead: false
            }
          : state
      );
      notifyChatGenerateStatusChange(ChatGenerateStatusEnum.generating, {
        targetAppId: runAppId,
        targetChatId: runChatId,
        hasBeenRead: false
      });

      const messages = chats2GPTMessages({
        messages: [
          {
            dataId: getNanoid(24),
            obj: ChatRoleEnum.Human,
            value: []
          }
        ],
        reserveId: true,
        reserveTool: true
      });

      const resolveTargetChatId = () => runChatId || useChatStore.getState().chatId;
      const isTargetStillActive = (targetChatId: string) =>
        activeTargetRef.current.appId === runAppId &&
        (runChatId
          ? activeTargetRef.current.chatId === targetChatId
          : useChatStore.getState().chatId === targetChatId);

      try {
        await onStartChat({
          messages,
          responseChatItemId,
          controller: chatController.current,
          generatingMessage,
          variables
        });

        const targetChatId = resolveTargetChatId();
        const finishedInActiveChat = isTargetStillActive(targetChatId);

        if (finishedInActiveChat) {
          setChatRecords((state) =>
            state.map((item, index) => {
              if (index !== state.length - 1 || item.dataId !== responseChatItemId) return item;

              // Check node response error
              const responseData = mergeNodeResponseDataByIdAndParent(item.responseData || []);
              if (responseData[responseData.length - 1]?.error) {
                toast({
                  title: t(getErrText(responseData[responseData.length - 1].error)),
                  status: 'error'
                });
              }

              return {
                ...item,
                status: 'finish',
                responseData
              };
            })
          );
        }

        finishPluginGenerateStatus({
          runAppId,
          targetChatId,
          runOutLinkAuthData,
          finishedInActiveChat
        });
      } catch (err: any) {
        const errorMsg = t(getErrText(err, t('common:core.chat.error.Chat error') as any));
        const targetChatId = resolveTargetChatId();
        const finishedInActiveChat = isTargetStillActive(targetChatId);

        if (isChatEntryModerationError(err)) {
          toast({ title: errorMsg, status: 'warning' });
          if (finishedInActiveChat) {
            setChatRecords([]);
            setTab(PluginRunBoxTabEnum.input);
          }
          finishPluginGenerateStatus({
            runAppId,
            targetChatId,
            runOutLinkAuthData,
            finishedInActiveChat,
            skipMarkRead: true
          });
          return;
        }
        toast({ title: errorMsg, status: 'error' });
        if (finishedInActiveChat) {
          setChatRecords((state) =>
            state.map((item, index) => {
              if (index !== state.length - 1 || item.dataId !== responseChatItemId) return item;
              return {
                ...item,
                status: 'finish'
              };
            })
          );
        }
        finishPluginGenerateStatus({
          runAppId,
          targetChatId,
          runOutLinkAuthData,
          finishedInActiveChat
        });
      }
    },
    [
      abortRequest,
      appId,
      chatId,
      finishPluginGenerateStatus,
      generatingMessage,
      isChatting,
      notifyChatGenerateStatusChange,
      onStartChat,
      outLinkAuthData,
      pluginInputs,
      setChatBoxData,
      setChatRecords,
      setTab,
      t,
      toast
    ]
  );

  const contextValue: PluginRunContextType = {
    ...props,
    isChatting,
    onSubmit,
    instruction
  };
  return (
    <WorkflowRuntimeContextProvider
      sourceTarget={{ sourceType: ChatSourceTypeEnum.app, sourceId: props.appId }}
      chatId={props.chatId}
      outLinkAuthData={props.outLinkAuthData}
      fileUploadMode={props.fileUploadMode ?? 'runtime'}
    >
      <PluginRunContext.Provider value={contextValue}>{children}</PluginRunContext.Provider>
    </WorkflowRuntimeContextProvider>
  );
};

export default PluginRunContextProvider;
