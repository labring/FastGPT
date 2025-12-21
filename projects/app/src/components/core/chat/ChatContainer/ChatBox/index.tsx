import React, {
  useCallback,
  useRef,
  useState,
  useMemo,
  useImperativeHandle,
  useEffect
} from 'react';
import Script from 'next/script';
import type {
  AIChatItemValueItemType,
  ChatSiteItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { Box, Checkbox, Flex } from '@chakra-ui/react';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { useForm } from 'react-hook-form';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import {
  closeCustomFeedback,
  updateChatAdminFeedback,
  updateChatUserFeedback,
  updateFeedbackReadStatus
} from '@/web/core/chat/feedback/api';
import { delChatRecordById } from '@/web/core/chat/api';
import type { AdminMarkType } from './components/SelectMarkCollection';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { postQuestionGuide } from '@/web/core/ai/api';
import type { ChatBoxInputType, ChatBoxInputFormType, SendPromptFnType } from './type.d';
import type { StartChatFnProps, generatingMessageProps } from '../type';
import ChatInput from './Input/ChatInput';
import ChatBoxDivider from '../../Divider';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import {
  getInteractiveByHistories,
  formatChatValue2InputType,
  setInteractiveResultToHistories
} from './utils';
import { ChatTypeEnum, textareaMinH } from './constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import ChatProvider, { ChatBoxContext, type ChatProviderProps } from './Provider';
import { WorkflowRuntimeContext } from '../context/workflowRuntimeContext';
import ChatItem from './components/ChatItem';
import dynamic from 'next/dynamic';
import type { StreamResponseType } from '@/web/common/api/fetch';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useCreation, useDebounceEffect, useMemoizedFn, useThrottleFn } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { mergeChatResponseData } from '@fastgpt/global/core/chat/utils';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import TimeBox from './components/TimeBox';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const FeedbackModal = dynamic(() => import('./components/FeedbackModal'));
const SelectMarkCollection = dynamic(() => import('./components/SelectMarkCollection'));
const WelcomeBox = dynamic(() => import('./components/WelcomeBox'));
const VariableInputForm = dynamic(() => import('./components/VariableInputForm'));
const ChatHomeVariablesForm = dynamic(() => import('./components/home/ChatHomeVariablesForm'));
const WelcomeHomeBox = dynamic(() => import('./components/home/WelcomeHomeBox'));
const QuickApps = dynamic(() => import('./components/home/QuickApps'));
const WorkorderEntrance = dynamic(() => import('@/pageComponents/chat/WorkorderEntrance'));

enum FeedbackTypeEnum {
  user = 'user',
  admin = 'admin',
  hidden = 'hidden'
}

type Props = OutLinkChatAuthProps &
  ChatProviderProps & {
    isReady: boolean;
    feedbackType?: `${FeedbackTypeEnum}`;
    showMarkIcon?: boolean; // admin mark dataset
    showVoiceIcon?: boolean;
    active?: boolean; // can use
    showWorkorder?: boolean;

    onStartChat?: (e: StartChatFnProps) => Promise<
      StreamResponseType & {
        isNewChat?: boolean;
      }
    >;
    onTriggerRefresh?: () => void;
  };

const ChatBox = ({
  isReady = true,
  feedbackType = FeedbackTypeEnum.hidden,
  showMarkIcon = false,
  showVoiceIcon = true,
  active = true,
  showWorkorder,
  onStartChat,
  chatType,
  onTriggerRefresh
}: Props) => {
  const ScrollContainerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setNotSufficientModalType } = useSystemStore();
  const { isPc } = useSystem();
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const chatController = useRef(new AbortController());
  const questionGuideController = useRef(new AbortController());
  const pluginController = useRef(new AbortController());

  const [isLoading, setIsLoading] = useState(false);
  const [feedbackId, setFeedbackId] = useState<string>();
  const [adminMarkData, setAdminMarkData] = useState<AdminMarkType & { dataId: string }>();
  const [questionGuides, setQuestionGuide] = useState<string[]>([]);

  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.avatar);
  const userAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.userAvatar);
  const chatBoxData = useContextSelector(ChatItemContext, (v) => v.chatBoxData);
  const ChatBoxRef = useContextSelector(ChatItemContext, (v) => v.ChatBoxRef);
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const setIsVariableVisible = useContextSelector(ChatItemContext, (v) => v.setIsVariableVisible);

  const isLoadingRecords = useContextSelector(ChatRecordContext, (v) => v.isLoadingRecords);
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);
  const ScrollData = useContextSelector(ChatRecordContext, (v) => v.ScrollData);
  const itemRefs = useContextSelector(ChatRecordContext, (v) => v.itemRefs);

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const welcomeText = useContextSelector(ChatBoxContext, (v) => v.welcomeText);
  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const questionGuide = useContextSelector(ChatBoxContext, (v) => v.questionGuide);
  const startSegmentedAudio = useContextSelector(ChatBoxContext, (v) => v.startSegmentedAudio);
  const finishSegmentedAudio = useContextSelector(ChatBoxContext, (v) => v.finishSegmentedAudio);
  const setAudioPlayingChatId = useContextSelector(ChatBoxContext, (v) => v.setAudioPlayingChatId);
  const splitText2Audio = useContextSelector(ChatBoxContext, (v) => v.splitText2Audio);
  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);

  // Workflow running, there are user input or selection
  const lastInteractive = useMemo(() => getInteractiveByHistories(chatRecords), [chatRecords]);

  const showExternalVariable = useMemo(() => {
    const map: Record<string, boolean> = {
      [ChatTypeEnum.log]: true,
      [ChatTypeEnum.test]: true,
      [ChatTypeEnum.chat]: true,
      [ChatTypeEnum.home]: true
    };
    return map[chatType] && variableList.some((item) => item.type === VariableInputEnum.custom);
  }, [variableList, chatType]);

  // compute variable input is finish.
  const chatForm = useForm<ChatBoxInputFormType>({
    defaultValues: {
      input: sessionStorage.getItem(`chatInput_${chatId}`) || '',
      files: [],
      chatStarted: false
    }
  });
  const { setValue, watch } = chatForm;
  const chatStartedWatch = watch('chatStarted');
  const inputValue = watch('input');

  useDebounceEffect(
    () => {
      if (inputValue) {
        sessionStorage.setItem(`chatInput_${chatId}`, inputValue);
      } else {
        sessionStorage.removeItem(`chatInput_${chatId}`);
      }
    },
    [inputValue, chatId],
    { wait: 300 }
  );

  const commonVariableList = variableList.filter(
    (item) => item.type !== VariableInputEnum.custom && item.type !== VariableInputEnum.internal
  );

  /*
    对话已经开始的标记：
    1. 保证 appId 一致。
    2. 有对话记录/手动点了开始/默认没有需要填写的变量。
  */
  const chatStarted =
    chatBoxData?.appId === appId &&
    (chatRecords.length > 0 ||
      chatStartedWatch ||
      (commonVariableList.length === 0 && !showExternalVariable));

  // 滚动到底部
  const scrollToBottom = useMemoizedFn((behavior: 'smooth' | 'auto' = 'smooth', delay = 0) => {
    setTimeout(() => {
      if (!ScrollContainerRef.current) {
        setTimeout(() => {
          scrollToBottom(behavior);
        }, 500);
      } else {
        ScrollContainerRef.current.scrollTo({
          top: ScrollContainerRef.current.scrollHeight,
          behavior
        });
      }
    }, delay);
  });

  // 聊天信息生成中……获取当前滚动条位置，判断是否需要滚动到底部
  const { run: generatingScroll } = useThrottleFn(
    (force?: boolean) => {
      if (!ScrollContainerRef.current) return;
      const isBottom =
        ScrollContainerRef.current.scrollTop + ScrollContainerRef.current.clientHeight + 150 >=
        ScrollContainerRef.current.scrollHeight;

      if (isBottom || force) {
        scrollToBottom('auto');
      }
    },
    {
      wait: 100
    }
  );

  const generatingMessage = useMemoizedFn(
    ({
      event,
      text = '',
      reasoningText,
      status,
      name,
      tool,
      interactive,
      autoTTSResponse,
      variables,
      nodeResponse,
      durationSeconds
    }: generatingMessageProps & { autoTTSResponse?: boolean }) => {
      setChatRecords((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1) return item;
          if (item.obj !== ChatRoleEnum.AI) return item;

          autoTTSResponse && splitText2Audio(formatChatValue2InputType(item.value).text || '');

          const lastValue: AIChatItemValueItemType = JSON.parse(
            JSON.stringify(item.value[item.value.length - 1])
          );

          if (event === SseResponseEventEnum.flowNodeResponse && nodeResponse) {
            return {
              ...item,
              responseData: item.responseData
                ? [...item.responseData, nodeResponse]
                : [nodeResponse]
            };
          } else if (event === SseResponseEventEnum.flowNodeStatus && status) {
            return {
              ...item,
              status,
              moduleName: name
            };
          } else if (reasoningText) {
            if (lastValue.type === ChatItemValueTypeEnum.reasoning && lastValue.reasoning) {
              lastValue.reasoning.content += reasoningText;
              return {
                ...item,
                value: item.value.slice(0, -1).concat(lastValue)
              };
            } else {
              const val: AIChatItemValueItemType = {
                type: ChatItemValueTypeEnum.reasoning,
                reasoning: {
                  content: reasoningText
                }
              };
              return {
                ...item,
                value: item.value.concat(val)
              };
            }
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
          } else if (event === SseResponseEventEnum.updateVariables && variables) {
            resetVariables({ variables });
          } else if (event === SseResponseEventEnum.interactive) {
            const val: AIChatItemValueItemType = {
              type: ChatItemValueTypeEnum.interactive,
              interactive
            };

            return {
              ...item,
              value: item.value.concat(val)
            };
          } else if (event === SseResponseEventEnum.workflowDuration && durationSeconds) {
            return {
              ...item,
              durationSeconds: item.durationSeconds
                ? +(item.durationSeconds + durationSeconds).toFixed(2)
                : durationSeconds
            };
          }

          return item;
        })
      );

      const forceScroll = event === SseResponseEventEnum.interactive;
      generatingScroll(forceScroll);
    }
  );

  // 重置输入内容
  const resetInputVal = useMemoizedFn(({ text = '', files = [] }: ChatBoxInputType) => {
    if (!TextareaDom.current) return;
    setValue('files', files);
    setValue('input', text);

    sessionStorage.removeItem(`chatInput_${chatId}`);

    setTimeout(() => {
      /* 回到最小高度 */
      if (TextareaDom.current) {
        TextareaDom.current.style.height =
          text === '' ? textareaMinH : `${TextareaDom.current.scrollHeight}px`;
      }
    }, 100);
  });

  // create question guide
  const createQuestionGuide = useCallback(async () => {
    if (!questionGuide.open || chatController.current?.signal?.aborted) return;
    try {
      const abortSignal = new AbortController();
      questionGuideController.current = abortSignal;

      const result = await postQuestionGuide(
        {
          appId,
          chatId,
          questionGuide,
          ...outLinkAuthData
        },
        abortSignal
      );
      if (Array.isArray(result)) {
        setQuestionGuide(result);
        setTimeout(() => {
          scrollToBottom();
        }, 100);
      }
    } catch (error) {}
  }, [questionGuide, appId, chatId, outLinkAuthData, scrollToBottom]);

  /* Abort chat completions, questionGuide */
  const abortRequest = useMemoizedFn((reason: string = 'stop') => {
    chatController.current?.abort(new Error(reason));
    questionGuideController.current?.abort(new Error(reason));
    pluginController.current?.abort(new Error(reason));
  });

  /**
   * user confirm send prompt
   */
  const sendPrompt = useMemoizedFn<SendPromptFnType>(
    ({
      text = '',
      files = [],
      history = chatRecords,
      autoTTSResponse = false,
      isInteractivePrompt = false,
      hideInUI = false
    }) => {
      variablesForm.handleSubmit(
        async ({ variables = {} }) => {
          if (!onStartChat) return;
          if (isChatting) {
            !hideInUI &&
              toast({
                title: t('chat:is_chatting'),
                status: 'warning'
              });
            return;
          }

          // Abort the previous request
          questionGuideController.current?.abort(new Error('stop'));

          text = text.trim();

          if (!text && files.length === 0) {
            toast({
              title: t('chat:content_empty'),
              status: 'warning'
            });
            return;
          }

          // Only declared variables are kept
          const requestVariables: Record<string, any> = {};
          variableList?.forEach((item) => {
            let val =
              variables[item.key] === '' ||
              variables[item.key] === undefined ||
              variables[item.key] === null
                ? item.defaultValue
                : variables[item.key];

            if (item.type === VariableInputEnum.timePointSelect && val) {
              val = formatTime2YMDHMS(new Date(val));
            } else if (item.type === VariableInputEnum.timeRangeSelect && val) {
              val = val.map((item: string) => (item ? formatTime2YMDHMS(new Date(item)) : ''));
            } else if (item.type === VariableInputEnum.file && Array.isArray(val)) {
              val = val.map((item) => ({
                id: item.id,
                key: item.key,
                url: item.key ? undefined : item.url,
                name: item.name,
                type: item.type
              }));
            }
            requestVariables[item.key] = valueTypeFormat(val, item.valueType);
          });

          const humanChatId = getNanoid(24);
          const responseChatId = getNanoid(24);

          // set auto audio playing
          if (autoTTSResponse) {
            await startSegmentedAudio();
            setAudioPlayingChatId(responseChatId);
          }

          const newChatList: ChatSiteItemType[] = [
            ...history,
            {
              id: humanChatId,
              dataId: humanChatId,
              obj: ChatRoleEnum.Human,
              time: new Date(),
              hideInUI,
              value: [
                ...files.map((file) => ({
                  type: ChatItemValueTypeEnum.file,
                  file: {
                    type: file.type,
                    name: file.name,
                    url: file.url,
                    icon: file.icon || '',
                    key: file.key || ''
                  }
                })),
                ...(text
                  ? [
                      {
                        type: ChatItemValueTypeEnum.text,
                        text: {
                          content: text
                        }
                      }
                    ]
                  : [])
              ] as UserChatItemValueItemType[],
              status: ChatStatusEnum.finish
            },
            {
              id: responseChatId,
              dataId: responseChatId,
              obj: ChatRoleEnum.AI,
              value: [
                {
                  type: ChatItemValueTypeEnum.text,
                  text: {
                    content: ''
                  }
                }
              ],
              status: ChatStatusEnum.loading
            }
          ];

          // Update histories(Interactive input does not require new session rounds)
          setChatRecords(
            isInteractivePrompt
              ? // 把交互的结果存储到对话记录中，交互模式下，不需要新的会话轮次
                setInteractiveResultToHistories(newChatList.slice(0, -2), text)
              : newChatList
          );

          // 清空输入内容
          resetInputVal({});
          setQuestionGuide([]);
          scrollToBottom('smooth', 100);

          try {
            // create abort obj
            const abortSignal = new AbortController();
            chatController.current = abortSignal;

            // 这里，无论是否为交互模式，最后都是 Human 的消息。
            const messages = chats2GPTMessages({
              messages: newChatList.slice(0, -1).map((item) => {
                if (item.obj === ChatRoleEnum.Human) {
                  item.files?.forEach((file) => {
                    file.url = '';
                  });
                }
                return item;
              }),
              reserveId: true,
              reserveTool: true
            });

            const { responseText } = await onStartChat({
              messages, // 保证最后一条是 Human 的消息
              responseChatItemId: responseChatId,
              controller: abortSignal,
              generatingMessage: (e) => generatingMessage({ ...e, autoTTSResponse }),
              variables: requestVariables
            });

            // Set last chat finish status
            let newChatHistories: ChatSiteItemType[] = [];
            setChatRecords((state) => {
              newChatHistories = state.map((item, index) => {
                if (index !== state.length - 1) return item;

                const responseData = mergeChatResponseData(item.responseData || []);
                // Check node response error
                if (!abortSignal?.signal?.aborted) {
                  const err =
                    responseData[responseData.length - 1]?.error ||
                    responseData[responseData.length - 1]?.errorText;
                  if (err) {
                    toast({
                      title: t(getErrText(err)),
                      status: 'warning'
                    });
                  }
                }

                return {
                  ...item,
                  status: ChatStatusEnum.finish,
                  time: new Date(),
                  responseData
                };
              });

              const lastInteractive = getInteractiveByHistories(state);
              if (lastInteractive?.type === 'paymentPause' && !lastInteractive.params.continue) {
                setNotSufficientModalType(TeamErrEnum.aiPointsNotEnough);
              }

              return newChatHistories;
            });

            setTimeout(() => {
              // If there is no interactive mode, create a question guide
              if (!getInteractiveByHistories(newChatHistories)) {
                createQuestionGuide();
              }

              generatingScroll(true);
              isPc && TextareaDom.current?.focus();
            }, 100);

            // tts audio
            autoTTSResponse && splitText2Audio(responseText, true);
          } catch (err: any) {
            console.log('Chat error', err);
            toast({
              title: t(getErrText(err, t('common:core.chat.error.Chat error') as any)),
              status: 'error',
              duration: 5000,
              isClosable: true
            });

            // set finish status
            setChatRecords((state) =>
              state.map((item, index) => {
                if (index !== state.length - 1) return item;
                return {
                  ...item,
                  time: new Date(),
                  status: ChatStatusEnum.finish
                };
              })
            );

            if (!err?.responseText) {
              resetInputVal({ text, files });
              // 这里的 newChatList 没包含用户交互输入的内容，所以重置后刚好是正确的。
              setChatRecords(newChatList.slice(0, newChatList.length - 2));
            }
          }

          autoTTSResponse && finishSegmentedAudio();
        },
        (err) => {
          console.log(err);
        }
      )();
    }
  );

  // retry input
  const onDelMessage = useCallback(
    (contentId: string, delFile = true) => {
      return delChatRecordById({
        appId,
        chatId,
        contentId,
        delFile,
        ...outLinkAuthData
      });
    },
    [appId, chatId, outLinkAuthData]
  );
  const retryInput = useMemoizedFn((dataId?: string) => {
    if (!dataId || !onDelMessage) return;

    return async () => {
      setIsLoading(true);
      const index = chatRecords.findIndex((item) => item.dataId === dataId);
      const delHistory = chatRecords.slice(index);
      try {
        await Promise.all(
          delHistory.map((item) => {
            if (item.dataId) {
              return onDelMessage(item.dataId, false);
            }
          })
        );
        setChatRecords((state) => (index === 0 ? [] : state.slice(0, index)));

        sendPrompt({
          ...formatChatValue2InputType(delHistory[0].value),
          history: chatRecords.slice(0, index)
        });
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, 'Retry failed')
        });
      }
      setIsLoading(false);
    };
  });
  // delete one message(One human and the ai response)
  const delOneMessage = useMemoizedFn((dataId: string) => {
    return () => {
      setChatRecords((state) => {
        let aiIndex = -1;

        return state.filter((chat, i) => {
          if (chat.dataId === dataId) {
            aiIndex = i + 1;
            onDelMessage(dataId);
            return false;
          } else if (aiIndex === i && chat.obj === ChatRoleEnum.AI && chat.dataId) {
            onDelMessage(chat.dataId);
            return false;
          }
          return true;
        });
      });
    };
  });
  // admin mark
  const onMark = useMemoizedFn((chat: ChatSiteItemType, q = '') => {
    if (!showMarkIcon || chat.obj !== ChatRoleEnum.AI) return;

    return () => {
      if (!chat.dataId) return;

      if (chat.adminFeedback) {
        setAdminMarkData({
          dataId: chat.dataId,
          datasetId: chat.adminFeedback.datasetId,
          collectionId: chat.adminFeedback.collectionId,
          feedbackDataId: chat.adminFeedback.feedbackDataId,
          q: chat.adminFeedback.q || q || '',
          a: chat.adminFeedback.a
        });
      } else {
        setAdminMarkData({
          dataId: chat.dataId,
          q,
          a: formatChatValue2InputType(chat.value).text
        });
      }
    };
  });
  const onAddUserLike = useMemoizedFn((chat: ChatSiteItemType) => {
    if (
      feedbackType !== FeedbackTypeEnum.user ||
      chat.obj !== ChatRoleEnum.AI ||
      chat.userBadFeedback
    )
      return;
    return () => {
      if (!chat.dataId || !chatId || !appId) return;

      const isGoodFeedback = !!chat.userGoodFeedback;
      setChatRecords((state) =>
        state.map((chatItem) =>
          chatItem.dataId === chat.dataId
            ? {
                ...chatItem,
                userGoodFeedback: isGoodFeedback ? undefined : 'yes'
              }
            : chatItem
        )
      );
      try {
        updateChatUserFeedback({
          appId,
          chatId,
          dataId: chat.dataId,
          userGoodFeedback: isGoodFeedback ? undefined : 'yes',
          ...outLinkAuthData
        });
      } catch (error) {}
    };
  });
  const onAddUserDislike = useMemoizedFn((chat: ChatSiteItemType) => {
    if (
      feedbackType !== FeedbackTypeEnum.user ||
      chat.obj !== ChatRoleEnum.AI ||
      chat.userGoodFeedback
    ) {
      return;
    }
    if (chat.userBadFeedback) {
      return () => {
        if (!chat.dataId || !chatId || !appId) return;
        setChatRecords((state) =>
          state.map((chatItem) =>
            chatItem.dataId === chat.dataId ? { ...chatItem, userBadFeedback: undefined } : chatItem
          )
        );
        try {
          updateChatUserFeedback({
            appId,
            chatId,
            dataId: chat.dataId,
            ...outLinkAuthData
          });
        } catch (error) {}
      };
    } else {
      return () => setFeedbackId(chat.dataId);
    }
  });
  const onCloseCustomFeedback = useMemoizedFn((chat: ChatSiteItemType, i: number) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked && appId && chatId && chat.dataId) {
        closeCustomFeedback({
          appId,
          chatId,
          dataId: chat.dataId,
          index: i
        });
        // update dom
        setChatRecords((state) =>
          state.map((chatItem) =>
            chatItem.obj === ChatRoleEnum.AI && chatItem.dataId === chat.dataId
              ? {
                  ...chatItem,
                  customFeedbacks: chatItem.customFeedbacks?.filter((_, index) => index !== i)
                }
              : chatItem
          )
        );
      }
    };
  });
  const onToggleFeedbackReadStatus = useMemoizedFn((chat: ChatSiteItemType) => {
    if (chatType !== ChatTypeEnum.log || chat.obj !== ChatRoleEnum.AI) return;
    return async () => {
      if (!appId || !chatId || !chat.dataId) return;

      const newReadStatus = !chat.isFeedbackRead;

      try {
        await updateFeedbackReadStatus({
          appId,
          chatId,
          dataId: chat.dataId,
          isRead: newReadStatus
        });

        setChatRecords((state) =>
          state.map((item) =>
            item.dataId === chat.dataId
              ? {
                  ...item,
                  isFeedbackRead: newReadStatus
                }
              : item
          )
        );

        onTriggerRefresh?.();
      } catch (error) {}
    };
  });

  const statusBoxData = useCreation(() => {
    if (!isChatting) return;
    const chatContent = chatRecords[chatRecords.length - 1];
    if (!chatContent) return;

    return {
      status: chatContent.status || ChatStatusEnum.loading,
      name: t(chatContent.moduleName || ('' as any)) || t('common:Loading')
    };
  }, [chatRecords, isChatting, t]);

  // page change and abort request
  useEffect(() => {
    setQuestionGuide([]);
    setValue('chatStarted', false);
    abortRequest('leave');
  }, [chatId, appId, abortRequest, setValue]);

  const canSendPrompt = onStartChat && chatStarted && active && !lastInteractive;

  // Add listener
  useEffect(() => {
    const windowMessage = ({ data }: MessageEvent<{ type: 'sendPrompt'; text: string }>) => {
      if (data?.type === 'sendPrompt' && data?.text) {
        sendPrompt({
          text: data.text
        });
      }
    };
    window.addEventListener('message', windowMessage);

    const fn: SendPromptFnType = (e) => {
      if (canSendPrompt || e.isInteractivePrompt) {
        sendPrompt(e);
      }
    };
    eventBus.on(EventNameEnum.sendQuestion, fn);
    eventBus.on(EventNameEnum.editQuestion, ({ text }: { text: string }) => {
      if (!text) return;
      resetInputVal({ text });
    });

    return () => {
      window.removeEventListener('message', windowMessage);
      eventBus.off(EventNameEnum.sendQuestion);
      eventBus.off(EventNameEnum.editQuestion);
    };
  }, [isReady, resetInputVal, sendPrompt, canSendPrompt]);

  // Auto send prompt
  useDebounceEffect(
    () => {
      if (
        isReady &&
        chatBoxData?.app?.chatConfig?.autoExecute?.open &&
        chatStarted &&
        chatRecords.length === 0 &&
        isChatRecordsLoaded
      ) {
        sendPrompt({
          text: chatBoxData?.app?.chatConfig?.autoExecute?.defaultPrompt || 'AUTO_EXECUTE',
          hideInUI: true
        });
      }
    },
    [
      isReady,
      chatStarted,
      chatRecords.length,
      isChatRecordsLoaded,
      sendPrompt,
      chatBoxData?.app?.chatConfig?.autoExecute
    ],
    {
      wait: 1000
    }
  );

  // output data
  useImperativeHandle(ChatBoxRef, () => ({
    restartChat() {
      abortRequest();

      setChatRecords([]);
      setValue('chatStarted', false);
    },
    scrollToBottom(behavior = 'auto') {
      scrollToBottom(behavior, 500);
    }
  }));

  // Visibility check
  useEffect(() => {
    const checkVariableVisibility = () => {
      if (!ScrollContainerRef.current) return;
      const container = ScrollContainerRef.current;
      const variableInput = container.querySelector('#variable-input');
      if (!variableInput) return;

      const containerRect = container.getBoundingClientRect();
      const elementRect = variableInput.getBoundingClientRect();

      if (elementRect.height === 0) return;

      setIsVariableVisible(
        containerRect.top < elementRect.bottom && containerRect.bottom > elementRect.top
      );
    };

    const container = ScrollContainerRef.current;
    if (container) {
      checkVariableVisibility();
      container.addEventListener('scroll', checkVariableVisibility);

      return () => {
        container.removeEventListener('scroll', checkVariableVisibility);
      };
    }
  }, [ScrollContainerRef, setIsVariableVisible]);

  // Home chat, and no chat records
  const isHomeRender = useMemo(() => {
    return chatType === ChatTypeEnum.home && chatRecords.length === 0 && !chatStartedWatch;
  }, [chatType, chatRecords.length, chatStartedWatch]);

  //chat history
  const RecordsBox = useMemo(() => {
    return (
      <Box id={'history'}>
        {chatRecords.map((item, index) => (
          <Box
            key={item.dataId}
            ref={(e) => {
              itemRefs.current.set(item.dataId, e);
            }}
          >
            {/* 并且时间和上一条的time相差超过十分钟 */}
            {index !== 0 &&
              item.time &&
              chatRecords[index - 1].time !== undefined &&
              new Date(item.time).getTime() - new Date(chatRecords[index - 1].time!).getTime() >
                10 * 60 * 1000 && <TimeBox time={item.time} />}

            <Box py={item.hideInUI ? 0 : 6}>
              {item.obj === ChatRoleEnum.Human && !item.hideInUI && (
                <ChatItem
                  type={item.obj}
                  avatar={userAvatar}
                  chat={item}
                  onRetry={retryInput(item.dataId)}
                  onDelete={delOneMessage(item.dataId)}
                  isLastChild={index === chatRecords.length - 1}
                />
              )}
              {item.obj === ChatRoleEnum.AI && (
                <ChatItem
                  type={item.obj}
                  avatar={appAvatar}
                  chat={item}
                  isLastChild={index === chatRecords.length - 1}
                  {...{
                    showVoiceIcon,
                    statusBoxData,
                    questionGuides,
                    onMark: onMark(
                      item,
                      formatChatValue2InputType(chatRecords[index - 1]?.value)?.text
                    ),
                    onAddUserLike: onAddUserLike(item),
                    onAddUserDislike: onAddUserDislike(item),
                    onToggleFeedbackReadStatus: onToggleFeedbackReadStatus(item)
                  }}
                >
                  {/* custom feedback */}
                  {item.customFeedbacks && item.customFeedbacks.length > 0 && (
                    <Box>
                      <ChatBoxDivider
                        icon={'core/app/customFeedback'}
                        text={t('common:core.app.feedback.Custom feedback')}
                      />
                      {item.customFeedbacks.map((text, i) => (
                        <Box key={i}>
                          <MyTooltip label={t('common:core.app.feedback.close custom feedback')}>
                            <Checkbox
                              onChange={onCloseCustomFeedback(item, i)}
                              icon={<MyIcon name={'common/check'} w={'12px'} />}
                            >
                              {text}
                            </Checkbox>
                          </MyTooltip>
                        </Box>
                      ))}
                    </Box>
                  )}
                  {/* admin mark content */}
                  {showMarkIcon && item.adminFeedback && (
                    <Box fontSize={'sm'}>
                      <ChatBoxDivider
                        icon="core/app/markLight"
                        text={t('common:core.chat.Admin Mark Content')}
                      />
                      <Box whiteSpace={'pre-wrap'}>
                        <Box color={'black'}>{item.adminFeedback.q}</Box>
                        <Box color={'myGray.600'}>{item.adminFeedback.a}</Box>
                      </Box>
                    </Box>
                  )}
                </ChatItem>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    );
  }, [
    chatRecords,
    userAvatar,
    retryInput,
    delOneMessage,
    appAvatar,
    showVoiceIcon,
    statusBoxData,
    questionGuides,
    onMark,
    onAddUserLike,
    onAddUserDislike,
    onToggleFeedbackReadStatus,
    t,
    showMarkIcon,
    itemRefs,
    onCloseCustomFeedback
  ]);

  // Child box
  const AppChatRenderBox = useMemo(() => {
    return (
      <ScrollData
        ScrollContainerRef={ScrollContainerRef}
        flex={'1 0 0'}
        h={0}
        w={'100%'}
        overflow={'overlay'}
        px={[4, 0]}
        pb={6}
      >
        <Box maxW={['100%', '92%']} h={'100%'} mx={'auto'}>
          {!!welcomeText && <WelcomeBox welcomeText={welcomeText} />}

          {/* variable input */}
          <Box id="variable-input">
            <VariableInputForm chatStarted={chatStarted} chatForm={chatForm} chatType={chatType} />
          </Box>

          {RecordsBox}
        </Box>
      </ScrollData>
    );
  }, [ScrollData, welcomeText, chatStarted, chatForm, chatType, RecordsBox]);
  const HomeChatRenderBox = useMemo(() => {
    return (
      <>
        <WelcomeHomeBox />

        <Box mt={5} w={'100%'}>
          <QuickApps />
        </Box>
      </>
    );
  }, []);

  return (
    <MyBox
      isLoading={isLoading}
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      position={'relative'}
    >
      <Script src={getWebReqUrl('/js/html2pdf.bundle.min.js')} strategy="lazyOnload"></Script>
      {/* chat box container */}
      {isHomeRender ? (
        <MyBox
          isLoading={isLoadingRecords}
          flex={'1 0 0'}
          h={0}
          px={[2, 4]}
          w="100%"
          maxW={['auto', 'min(820px, 100%)']}
          mx={'auto'}
        >
          <Flex h={'100%'} flexDir={'column'} justifyContent={'center'} w={'100%'}>
            {HomeChatRenderBox}
            {variableList.filter((item) => item.type !== VariableInputEnum.internal).length > 0 ? (
              <Box w={'100%'}>
                <ChatHomeVariablesForm chatForm={chatForm} />
              </Box>
            ) : (
              <ChatInput
                onSendMessage={sendPrompt}
                onStop={() => abortRequest('stop')}
                TextareaDom={TextareaDom}
                resetInputVal={resetInputVal}
                chatForm={chatForm}
              />
            )}
          </Flex>
        </MyBox>
      ) : (
        <>
          {AppChatRenderBox}
          {canSendPrompt && (
            <Box
              px={[3, 5]}
              m={['0 auto 10px', '10px auto']}
              w={'100%'}
              maxW={['auto', 'min(820px, 100%)']}
            >
              {showWorkorder && <WorkorderEntrance />}

              <ChatInput
                onSendMessage={sendPrompt}
                onStop={() => abortRequest('stop')}
                TextareaDom={TextareaDom}
                resetInputVal={resetInputVal}
                chatForm={chatForm}
              />
            </Box>
          )}
        </>
      )}

      {/* user feedback modal */}
      {!!feedbackId && chatId && (
        <FeedbackModal
          appId={appId}
          chatId={chatId}
          dataId={feedbackId}
          onClose={() => setFeedbackId(undefined)}
          onSuccess={(content: string) => {
            setChatRecords((state) =>
              state.map((item) =>
                item.dataId === feedbackId ? { ...item, userBadFeedback: content } : item
              )
            );
            setFeedbackId(undefined);
          }}
        />
      )}
      {/* admin mark data */}
      {!!adminMarkData && (
        <SelectMarkCollection
          adminMarkData={adminMarkData}
          setAdminMarkData={(e) => setAdminMarkData({ ...e, dataId: adminMarkData.dataId })}
          onClose={() => setAdminMarkData(undefined)}
          onSuccess={(adminFeedback) => {
            if (!appId || !chatId || !adminMarkData.dataId) return;
            updateChatAdminFeedback({
              appId,
              chatId,
              dataId: adminMarkData.dataId,
              ...adminFeedback
            });

            // update dom
            setChatRecords((state) =>
              state.map((chatItem) =>
                chatItem.dataId === adminMarkData.dataId
                  ? {
                      ...chatItem,
                      adminFeedback
                    }
                  : chatItem
              )
            );
          }}
        />
      )}
    </MyBox>
  );
};

const ChatBoxContainer = (props: Props) => {
  return (
    <ChatProvider {...props}>
      <ChatBox {...props} />
    </ChatProvider>
  );
};

export default React.memo(ChatBoxContainer);
