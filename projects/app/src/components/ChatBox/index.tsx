import React, {
  useCallback,
  useRef,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
  ForwardedRef,
  useEffect
} from 'react';
import Script from 'next/script';
import { throttle } from 'lodash';
import type {
  AIChatItemValueItemType,
  ChatSiteItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type.d';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { Box, Flex, Checkbox } from '@chakra-ui/react';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { VariableInputEnum } from '@fastgpt/global/core/module/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/module/runtime/constants';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import {
  closeCustomFeedback,
  updateChatAdminFeedback,
  updateChatUserFeedback
} from '@/web/core/chat/api';
import type { AdminMarkType } from './SelectMarkCollection';

import MyTooltip from '../MyTooltip';

import { postQuestionGuide } from '@/web/core/ai/api';
import type {
  generatingMessageProps,
  StartChatFnProps,
  ComponentRef,
  ChatBoxInputType,
  ChatBoxInputFormType
} from './type.d';
import MessageInput from './MessageInput';
import ChatBoxDivider from '../core/chat/Divider';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { formatChatValue2InputType } from './utils';
import { textareaMinH } from './constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/module/runtime/constants';
import ChatProvider, { useChatProviderStore } from './Provider';

import ChatItem from './components/ChatItem';

import dynamic from 'next/dynamic';
const ResponseTags = dynamic(() => import('./ResponseTags'));
const FeedbackModal = dynamic(() => import('./FeedbackModal'));
const ReadFeedbackModal = dynamic(() => import('./ReadFeedbackModal'));
const SelectMarkCollection = dynamic(() => import('./SelectMarkCollection'));
const Empty = dynamic(() => import('./components/Empty'));
const WelcomeBox = dynamic(() => import('./components/WelcomeBox'));
const VariableInput = dynamic(() => import('./components/VariableInput'));

enum FeedbackTypeEnum {
  user = 'user',
  admin = 'admin',
  hidden = 'hidden'
}

type Props = OutLinkChatAuthProps & {
  feedbackType?: `${FeedbackTypeEnum}`;
  showMarkIcon?: boolean; // admin mark dataset
  showVoiceIcon?: boolean;
  showEmptyIntro?: boolean;
  appAvatar?: string;
  userAvatar?: string;
  userGuideModule?: ModuleItemType;
  showFileSelector?: boolean;
  active?: boolean; // can use
  appId: string;

  // not chat test params
  chatId?: string;

  onUpdateVariable?: (e: Record<string, any>) => void;
  onStartChat?: (e: StartChatFnProps) => Promise<{
    responseText: string;
    [DispatchNodeResponseKeyEnum.nodeResponse]: ChatHistoryItemResType[];
    isNewChat?: boolean;
  }>;
  onDelMessage?: (e: { contentId: string }) => void;
};

/* 
  The input is divided into sections
  1. text
  2. img
  3. file
  4. ....
*/

const ChatBox = (
  {
    feedbackType = FeedbackTypeEnum.hidden,
    showMarkIcon = false,
    showVoiceIcon = true,
    showEmptyIntro = false,
    appAvatar,
    userAvatar,
    showFileSelector,
    active = true,
    appId,
    chatId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    onUpdateVariable,
    onStartChat,
    onDelMessage
  }: Props,
  ref: ForwardedRef<ComponentRef>
) => {
  const ChatBoxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPc, setLoading, feConfigs } = useSystemStore();
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const chatController = useRef(new AbortController());
  const questionGuideController = useRef(new AbortController());
  const isNewChatReplace = useRef(false);

  const [feedbackId, setFeedbackId] = useState<string>();
  const [readFeedbackData, setReadFeedbackData] = useState<{
    chatItemId: string;
    content: string;
  }>();
  const [adminMarkData, setAdminMarkData] = useState<AdminMarkType & { chatItemId: string }>();
  const [questionGuides, setQuestionGuide] = useState<string[]>([]);

  const {
    welcomeText,
    variableModules,
    questionGuide,
    startSegmentedAudio,
    finishSegmentedAudio,
    setAudioPlayingChatId,
    splitText2Audio,
    chatHistories,
    setChatHistories,
    isChatting
  } = useChatProviderStore();

  /* variable */
  const filterVariableModules = useMemo(
    () => variableModules.filter((item) => item.type !== VariableInputEnum.external),
    [variableModules]
  );

  // compute variable input is finish.
  const chatForm = useForm<ChatBoxInputFormType>({
    defaultValues: {
      input: '',
      files: [],
      variables: {},
      chatStarted: false
    }
  });
  const { setValue, watch, handleSubmit } = chatForm;
  const variables = watch('variables');
  const chatStarted = watch('chatStarted');
  const variableIsFinish = useMemo(() => {
    if (!filterVariableModules || filterVariableModules.length === 0 || chatHistories.length > 0)
      return true;

    for (let i = 0; i < filterVariableModules.length; i++) {
      const item = filterVariableModules[i];
      if (item.required && !variables[item.key]) {
        return false;
      }
    }

    return chatStarted;
  }, [filterVariableModules, chatHistories.length, chatStarted, variables]);

  // 滚动到底部
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    if (!ChatBoxRef.current) return;
    ChatBoxRef.current.scrollTo({
      top: ChatBoxRef.current.scrollHeight,
      behavior
    });
  };

  // 聊天信息生成中……获取当前滚动条位置，判断是否需要滚动到底部
  const generatingScroll = useCallback(
    throttle(() => {
      if (!ChatBoxRef.current) return;
      const isBottom =
        ChatBoxRef.current.scrollTop + ChatBoxRef.current.clientHeight + 150 >=
        ChatBoxRef.current.scrollHeight;

      isBottom && scrollToBottom('auto');
    }, 100),
    []
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const generatingMessage = useCallback(
    ({
      event,
      text = '',
      status,
      name,
      tool,
      autoTTSResponse
    }: generatingMessageProps & { autoTTSResponse?: boolean }) => {
      setChatHistories((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1) return item;
          if (item.obj !== ChatRoleEnum.AI) return item;

          autoTTSResponse && splitText2Audio(formatChatValue2InputType(item.value).text || '');

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
      generatingScroll();
    },
    [generatingScroll, setChatHistories, splitText2Audio]
  );

  // 重置输入内容
  const resetInputVal = useCallback(
    ({ text = '', files = [] }: ChatBoxInputType) => {
      if (!TextareaDom.current) return;
      setValue('files', files);
      setValue('input', text);

      setTimeout(() => {
        /* 回到最小高度 */
        if (TextareaDom.current) {
          TextareaDom.current.style.height =
            text === '' ? textareaMinH : `${TextareaDom.current.scrollHeight}px`;
        }
      }, 100);
    },
    [setValue]
  );

  // create question guide
  const createQuestionGuide = useCallback(
    async ({ history }: { history: ChatSiteItemType[] }) => {
      if (!questionGuide || chatController.current?.signal?.aborted) return;

      try {
        const abortSignal = new AbortController();
        questionGuideController.current = abortSignal;

        const result = await postQuestionGuide(
          {
            messages: chats2GPTMessages({ messages: history, reserveId: false }).slice(-6),
            shareId,
            outLinkUid,
            teamId,
            teamToken
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
    },
    [questionGuide, shareId, outLinkUid, teamId, teamToken]
  );

  /**
   * user confirm send prompt
   */
  const sendPrompt = useCallback(
    ({
      text = '',
      files = [],
      history = chatHistories,
      autoTTSResponse = false
    }: ChatBoxInputType & {
      autoTTSResponse?: boolean;
      history?: ChatSiteItemType[];
    }) => {
      handleSubmit(async ({ variables }) => {
        if (!onStartChat) return;
        if (isChatting) {
          toast({
            title: '正在聊天中...请等待结束',
            status: 'warning'
          });
          return;
        }

        text = text.trim();

        if (!text && files.length === 0) {
          toast({
            title: '内容为空',
            status: 'warning'
          });
          return;
        }

        const responseChatId = getNanoid(24);
        questionGuideController.current?.abort('stop');

        // set auto audio playing
        if (autoTTSResponse) {
          await startSegmentedAudio();
          setAudioPlayingChatId(responseChatId);
        }

        const newChatList: ChatSiteItemType[] = [
          ...history,
          {
            dataId: getNanoid(24),
            obj: ChatRoleEnum.Human,
            value: [
              ...files.map((file) => ({
                type: ChatItemValueTypeEnum.file,
                file: {
                  type: file.type,
                  name: file.name,
                  url: file.url || ''
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
            status: 'finish'
          },
          {
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
            status: 'loading'
          }
        ];

        // 插入内容
        setChatHistories(newChatList);

        // 清空输入内容
        resetInputVal({});
        setQuestionGuide([]);
        setTimeout(() => {
          scrollToBottom();
        }, 100);
        try {
          // create abort obj
          const abortSignal = new AbortController();
          chatController.current = abortSignal;

          const messages = chats2GPTMessages({ messages: newChatList, reserveId: true });

          const {
            responseData,
            responseText,
            isNewChat = false
          } = await onStartChat({
            chatList: newChatList,
            messages,
            controller: abortSignal,
            generatingMessage: (e) => generatingMessage({ ...e, autoTTSResponse }),
            variables
          });

          isNewChatReplace.current = isNewChat;

          // set finish status
          setChatHistories((state) =>
            state.map((item, index) => {
              if (index !== state.length - 1) return item;
              return {
                ...item,
                status: 'finish',
                responseData
              };
            })
          );
          setTimeout(() => {
            createQuestionGuide({
              history: newChatList.map((item, i) =>
                i === newChatList.length - 1
                  ? {
                      ...item,
                      value: [
                        {
                          type: ChatItemValueTypeEnum.text,
                          text: {
                            content: responseText
                          }
                        }
                      ]
                    }
                  : item
              )
            });
            generatingScroll();
            isPc && TextareaDom.current?.focus();
          }, 100);

          // tts audio
          autoTTSResponse && splitText2Audio(responseText, true);
        } catch (err: any) {
          toast({
            title: t(getErrText(err, 'core.chat.error.Chat error')),
            status: 'error',
            duration: 5000,
            isClosable: true
          });

          if (!err?.responseText) {
            resetInputVal({ text, files });
            setChatHistories(newChatList.slice(0, newChatList.length - 2));
          }

          // set finish status
          setChatHistories((state) =>
            state.map((item, index) => {
              if (index !== state.length - 1) return item;
              return {
                ...item,
                status: 'finish'
              };
            })
          );
        }

        autoTTSResponse && finishSegmentedAudio();
      })();
    },
    [
      chatHistories,
      createQuestionGuide,
      finishSegmentedAudio,
      generatingMessage,
      generatingScroll,
      handleSubmit,
      isChatting,
      isPc,
      onStartChat,
      resetInputVal,
      setAudioPlayingChatId,
      setChatHistories,
      splitText2Audio,
      startSegmentedAudio,
      t,
      toast
    ]
  );

  // retry input
  const retryInput = useCallback(
    (dataId?: string) => {
      if (!dataId || !onDelMessage) return;

      return async () => {
        setLoading(true);
        const index = chatHistories.findIndex((item) => item.dataId === dataId);
        const delHistory = chatHistories.slice(index);
        try {
          await Promise.all(
            delHistory.map((item) => {
              if (item.dataId) {
                return onDelMessage({ contentId: item.dataId });
              }
            })
          );
          setChatHistories((state) => (index === 0 ? [] : state.slice(0, index)));

          sendPrompt({
            ...formatChatValue2InputType(delHistory[0].value),
            history: chatHistories.slice(0, index)
          });
        } catch (error) {
          toast({
            status: 'warning',
            title: getErrText(error, 'Retry failed')
          });
        }
        setLoading(false);
      };
    },
    [chatHistories, onDelMessage, sendPrompt, setLoading, toast]
  );
  // delete one message(One human and the ai response)
  const delOneMessage = useCallback(
    (dataId?: string) => {
      if (!dataId || !onDelMessage) return;
      return () => {
        setChatHistories((state) => {
          let aiIndex = -1;

          return state.filter((chat, i) => {
            if (chat.dataId === dataId) {
              aiIndex = i + 1;
              onDelMessage({
                contentId: dataId
              });
              return false;
            } else if (aiIndex === i && chat.obj === ChatRoleEnum.AI && chat.dataId) {
              onDelMessage({
                contentId: chat.dataId
              });
              return false;
            }
            return true;
          });
        });
      };
    },
    [onDelMessage]
  );
  // admin mark
  const onMark = useCallback(
    (chat: ChatSiteItemType, q = '') => {
      if (!showMarkIcon || chat.obj !== ChatRoleEnum.AI) return;

      return () => {
        if (!chat.dataId) return;

        if (chat.adminFeedback) {
          setAdminMarkData({
            chatItemId: chat.dataId,
            datasetId: chat.adminFeedback.datasetId,
            collectionId: chat.adminFeedback.collectionId,
            dataId: chat.adminFeedback.dataId,
            q: chat.adminFeedback.q || q || '',
            a: chat.adminFeedback.a
          });
        } else {
          setAdminMarkData({
            chatItemId: chat.dataId,
            q,
            a: formatChatValue2InputType(chat.value).text
          });
        }
      };
    },
    [showMarkIcon]
  );
  const onAddUserLike = useCallback(
    (chat: ChatSiteItemType) => {
      if (
        feedbackType !== FeedbackTypeEnum.user ||
        chat.obj !== ChatRoleEnum.AI ||
        chat.userBadFeedback
      )
        return;
      return () => {
        if (!chat.dataId || !chatId || !appId) return;

        const isGoodFeedback = !!chat.userGoodFeedback;
        setChatHistories((state) =>
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
            teamId,
            teamToken,
            chatItemId: chat.dataId,
            shareId,
            outLinkUid,
            userGoodFeedback: isGoodFeedback ? undefined : 'yes'
          });
        } catch (error) {}
      };
    },
    [appId, chatId, feedbackType, outLinkUid, shareId, teamId, teamToken]
  );
  const onCloseUserLike = useCallback(
    (chat: ChatSiteItemType) => {
      if (feedbackType !== FeedbackTypeEnum.admin) return;
      return () => {
        if (!chat.dataId || !chatId || !appId) return;
        setChatHistories((state) =>
          state.map((chatItem) =>
            chatItem.dataId === chat.dataId
              ? { ...chatItem, userGoodFeedback: undefined }
              : chatItem
          )
        );
        updateChatUserFeedback({
          appId,
          teamId,
          teamToken,
          chatId,
          chatItemId: chat.dataId,
          userGoodFeedback: undefined
        });
      };
    },
    [appId, chatId, feedbackType, teamId, teamToken]
  );
  const onADdUserDislike = useCallback(
    (chat: ChatSiteItemType) => {
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
          setChatHistories((state) =>
            state.map((chatItem) =>
              chatItem.dataId === chat.dataId
                ? { ...chatItem, userBadFeedback: undefined }
                : chatItem
            )
          );
          try {
            updateChatUserFeedback({
              appId,
              chatId,
              chatItemId: chat.dataId,
              shareId,
              teamId,
              teamToken,
              outLinkUid
            });
          } catch (error) {}
        };
      } else {
        return () => setFeedbackId(chat.dataId);
      }
    },
    [appId, chatId, feedbackType, outLinkUid, shareId, teamId, teamToken]
  );
  const onReadUserDislike = useCallback(
    (chat: ChatSiteItemType) => {
      if (feedbackType !== FeedbackTypeEnum.admin || chat.obj !== ChatRoleEnum.AI) return;
      return () => {
        if (!chat.dataId) return;
        setReadFeedbackData({
          chatItemId: chat.dataId || '',
          content: chat.userBadFeedback || ''
        });
      };
    },
    [feedbackType]
  );
  const onCloseCustomFeedback = useCallback(
    (chat: ChatSiteItemType, i: number) => {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked && appId && chatId && chat.dataId) {
          closeCustomFeedback({
            appId,
            chatId,
            chatItemId: chat.dataId,
            index: i
          });
          // update dom
          setChatHistories((state) =>
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
    },
    [appId, chatId]
  );

  const showEmpty = useMemo(
    () =>
      feConfigs?.show_emptyChat &&
      showEmptyIntro &&
      chatHistories.length === 0 &&
      !filterVariableModules?.length &&
      !welcomeText,
    [
      chatHistories.length,
      feConfigs?.show_emptyChat,
      showEmptyIntro,
      filterVariableModules?.length,
      welcomeText
    ]
  );
  const statusBoxData = useMemo(() => {
    if (!isChatting) return;
    const chatContent = chatHistories[chatHistories.length - 1];
    if (!chatContent) return;

    return {
      status: chatContent.status || 'loading',
      name: t(chatContent.moduleName || '') || t('common.Loading')
    };
  }, [chatHistories, isChatting, t]);

  // page change and abort request
  useEffect(() => {
    isNewChatReplace.current = false;
    setQuestionGuide([]);
    return () => {
      chatController.current?.abort('leave');
      if (!isNewChatReplace.current) {
        questionGuideController.current?.abort('leave');
      }
    };
  }, [router.query]);

  // add listener
  useEffect(() => {
    const windowMessage = ({ data }: MessageEvent<{ type: 'sendPrompt'; text: string }>) => {
      if (data?.type === 'sendPrompt' && data?.text) {
        sendPrompt({
          text: data.text
        });
      }
    };
    window.addEventListener('message', windowMessage);

    eventBus.on(EventNameEnum.sendQuestion, ({ text }: { text: string }) => {
      if (!text) return;
      sendPrompt({
        text
      });
    });
    eventBus.on(EventNameEnum.editQuestion, ({ text }: { text: string }) => {
      if (!text) return;
      resetInputVal({ text });
    });

    return () => {
      window.removeEventListener('message', windowMessage);
      eventBus.off(EventNameEnum.sendQuestion);
      eventBus.off(EventNameEnum.editQuestion);
    };
  }, [resetInputVal, sendPrompt]);

  // output data
  useImperativeHandle(ref, () => ({
    getChatHistories: () => chatHistories,
    resetVariables(e) {
      const defaultVal: Record<string, any> = {};
      filterVariableModules?.forEach((item) => {
        defaultVal[item.key] = '';
      });

      setValue('variables', e || defaultVal);
    },
    resetHistory(e) {
      setValue('chatStarted', e.length > 0);
      setChatHistories(e);
    },
    scrollToBottom,
    sendPrompt: (question: string) => {
      sendPrompt({
        text: question
      });
    }
  }));

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Script src="/js/html2pdf.bundle.min.js" strategy="lazyOnload"></Script>
      {/* chat box container */}
      <Box ref={ChatBoxRef} flex={'1 0 0'} h={0} w={'100%'} overflow={'overlay'} px={[4, 0]} pb={3}>
        <Box id="chat-container" maxW={['100%', '92%']} h={'100%'} mx={'auto'}>
          {showEmpty && <Empty />}
          {!!welcomeText && <WelcomeBox appAvatar={appAvatar} welcomeText={welcomeText} />}
          {/* variable input */}
          {!!filterVariableModules?.length && (
            <VariableInput
              appAvatar={appAvatar}
              variableModules={filterVariableModules}
              variableIsFinish={variableIsFinish}
              chatForm={chatForm}
              onSubmitVariables={(data) => {
                setValue('chatStarted', true);
                onUpdateVariable?.(data);
              }}
            />
          )}
          {/* chat history */}
          <Box id={'history'}>
            {chatHistories.map((item, index) => (
              <Box key={item.dataId} py={5}>
                {item.obj === 'Human' && (
                  <ChatItem
                    type={item.obj}
                    avatar={item.obj === 'Human' ? userAvatar : appAvatar}
                    chat={item}
                    onRetry={retryInput(item.dataId)}
                    onDelete={delOneMessage(item.dataId)}
                    isLastChild={index === chatHistories.length - 1}
                  />
                )}
                {item.obj === 'AI' && (
                  <>
                    <ChatItem
                      type={item.obj}
                      avatar={appAvatar}
                      chat={item}
                      isLastChild={index === chatHistories.length - 1}
                      {...(item.obj === 'AI' && {
                        showVoiceIcon,
                        shareId,
                        outLinkUid,
                        teamId,
                        teamToken,
                        statusBoxData,
                        questionGuides,
                        onMark: onMark(
                          item,
                          formatChatValue2InputType(chatHistories[index - 1]?.value)?.text
                        ),
                        onAddUserLike: onAddUserLike(item),
                        onCloseUserLike: onCloseUserLike(item),
                        onAddUserDislike: onADdUserDislike(item),
                        onReadUserDislike: onReadUserDislike(item)
                      })}
                    >
                      <ResponseTags
                        flowResponses={item.responseData}
                        showDetail={!shareId && !teamId}
                      />

                      {/* custom feedback */}
                      {item.customFeedbacks && item.customFeedbacks.length > 0 && (
                        <Box>
                          <ChatBoxDivider
                            icon={'core/app/customFeedback'}
                            text={t('core.app.feedback.Custom feedback')}
                          />
                          {item.customFeedbacks.map((text, i) => (
                            <Box key={`${text}${i}`}>
                              <MyTooltip label={t('core.app.feedback.close custom feedback')}>
                                <Checkbox onChange={onCloseCustomFeedback(item, i)}>
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
                            text={t('core.chat.Admin Mark Content')}
                          />
                          <Box whiteSpace={'pre-wrap'}>
                            <Box color={'black'}>{item.adminFeedback.q}</Box>
                            <Box color={'myGray.600'}>{item.adminFeedback.a}</Box>
                          </Box>
                        </Box>
                      )}
                    </ChatItem>
                  </>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      {/* message input */}
      {onStartChat && variableIsFinish && active && (
        <MessageInput
          onSendMessage={sendPrompt}
          onStop={() => chatController.current?.abort('stop')}
          TextareaDom={TextareaDom}
          resetInputVal={resetInputVal}
          showFileSelector={showFileSelector}
          chatForm={chatForm}
          appId={appId}
        />
      )}
      {/* user feedback modal */}
      {!!feedbackId && chatId && appId && (
        <FeedbackModal
          appId={appId}
          teamId={teamId}
          teamToken={teamToken}
          chatId={chatId}
          chatItemId={feedbackId}
          shareId={shareId}
          outLinkUid={outLinkUid}
          onClose={() => setFeedbackId(undefined)}
          onSuccess={(content: string) => {
            setChatHistories((state) =>
              state.map((item) =>
                item.dataId === feedbackId ? { ...item, userBadFeedback: content } : item
              )
            );
            setFeedbackId(undefined);
          }}
        />
      )}
      {/* admin read feedback modal */}
      {!!readFeedbackData && (
        <ReadFeedbackModal
          content={readFeedbackData.content}
          onClose={() => setReadFeedbackData(undefined)}
          onCloseFeedback={() => {
            setChatHistories((state) =>
              state.map((chatItem) =>
                chatItem.dataId === readFeedbackData.chatItemId
                  ? { ...chatItem, userBadFeedback: undefined }
                  : chatItem
              )
            );
            try {
              if (!chatId || !appId) return;
              updateChatUserFeedback({
                appId,
                chatId,
                chatItemId: readFeedbackData.chatItemId
              });
            } catch (error) {}
            setReadFeedbackData(undefined);
          }}
        />
      )}
      {/* admin mark data */}
      {!!adminMarkData && (
        <SelectMarkCollection
          adminMarkData={adminMarkData}
          setAdminMarkData={(e) => setAdminMarkData({ ...e, chatItemId: adminMarkData.chatItemId })}
          onClose={() => setAdminMarkData(undefined)}
          onSuccess={(adminFeedback) => {
            if (!appId || !chatId || !adminMarkData.chatItemId) return;
            updateChatAdminFeedback({
              appId,
              chatId,
              chatItemId: adminMarkData.chatItemId,
              ...adminFeedback
            });

            // update dom
            setChatHistories((state) =>
              state.map((chatItem) =>
                chatItem.dataId === adminMarkData.chatItemId
                  ? {
                      ...chatItem,
                      adminFeedback
                    }
                  : chatItem
              )
            );

            if (readFeedbackData && chatId && appId) {
              updateChatUserFeedback({
                appId,
                chatId,
                chatItemId: readFeedbackData.chatItemId,
                userBadFeedback: undefined
              });
              setChatHistories((state) =>
                state.map((chatItem) =>
                  chatItem.dataId === readFeedbackData.chatItemId
                    ? { ...chatItem, userBadFeedback: undefined }
                    : chatItem
                )
              );
              setReadFeedbackData(undefined);
            }
          }}
        />
      )}
    </Flex>
  );
};
const ForwardChatBox = forwardRef(ChatBox);

const ChatBoxContainer = (props: Props, ref: ForwardedRef<ComponentRef>) => {
  return (
    <ChatProvider {...props}>
      <ForwardChatBox {...props} ref={ref} />
    </ChatProvider>
  );
};

export default React.memo(forwardRef(ChatBoxContainer));
