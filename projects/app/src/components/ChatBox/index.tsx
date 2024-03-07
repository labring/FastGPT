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
import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type.d';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { Box, Flex, useTheme, Checkbox } from '@chakra-ui/react';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { ModuleRunTimerOutputEnum, VariableInputEnum } from '@fastgpt/global/core/module/constants';
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
import { splitGuideModule } from '@fastgpt/global/core/module/utils';
import type {
  generatingMessageProps,
  StartChatFnProps,
  ComponentRef,
  ChatBoxInputType
} from './type.d';
import MessageInput from './MessageInput';
import ChatBoxDivider from '../core/chat/Divider';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { formatChatValue2InputType } from './utils';
import { textareaMinH } from './constants';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';

import dynamic from 'next/dynamic';
const ResponseTags = dynamic(() => import('./ResponseTags'));
const FeedbackModal = dynamic(() => import('./FeedbackModal'));
const ReadFeedbackModal = dynamic(() => import('./ReadFeedbackModal'));
const SelectMarkCollection = dynamic(() => import('./SelectMarkCollection'));
const Empty = dynamic(() => import('./components/Empty'));
const ChatAvatar = dynamic(() => import('./components/ChatAvatar'));
const WelcomeBox = dynamic(() => import('./components/WelcomeBox'));
const ChatController = dynamic(() => import('./components/ChatController'));
const VariableInput = dynamic(() => import('./components/VariableInput'));
const ChatItem = dynamic(() => import('./components/ChatItem'));

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

  // not chat test params
  appId?: string;
  chatId?: string;

  onUpdateVariable?: (e: Record<string, any>) => void;
  onStartChat?: (e: StartChatFnProps) => Promise<{
    responseText: string;
    [ModuleRunTimerOutputEnum.responseData]: ChatHistoryItemResType[];
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
    userGuideModule,
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
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPc, setLoading, feConfigs } = useSystemStore();
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const chatController = useRef(new AbortController());
  const questionGuideController = useRef(new AbortController());
  const isNewChatReplace = useRef(false);

  const [chatHistories, setChatHistories] = useState<ChatSiteItemType[]>([]);
  const [feedbackId, setFeedbackId] = useState<string>();
  const [readFeedbackData, setReadFeedbackData] = useState<{
    chatItemId: string;
    content: string;
  }>();
  const [adminMarkData, setAdminMarkData] = useState<AdminMarkType & { chatItemId: string }>();
  const [questionGuides, setQuestionGuide] = useState<string[]>([]);

  const isChatting = useMemo(
    () =>
      chatHistories[chatHistories.length - 1] &&
      chatHistories[chatHistories.length - 1]?.status !== 'finish',
    [chatHistories]
  );

  const { welcomeText, variableModules, questionGuide, ttsConfig } = useMemo(
    () => splitGuideModule(userGuideModule),
    [userGuideModule]
  );
  const filterVariableModules = useMemo(
    () => variableModules.filter((item) => item.type !== VariableInputEnum.external),
    [variableModules]
  );

  // compute variable input is finish.
  const chatForm = useForm<{
    variables: Record<string, any>;
  }>({
    defaultValues: {
      variables: {}
    }
  });
  const { setValue, watch, handleSubmit } = chatForm;
  const variables = watch('variables');

  const [variableInputFinish, setVariableInputFinish] = useState(false); // clicked start chat button
  const variableIsFinish = useMemo(() => {
    if (!filterVariableModules || filterVariableModules.length === 0 || chatHistories.length > 0)
      return true;

    for (let i = 0; i < filterVariableModules.length; i++) {
      const item = filterVariableModules[i];
      if (item.required && !variables[item.key]) {
        return false;
      }
    }

    return variableInputFinish;
  }, [chatHistories.length, variableInputFinish, filterVariableModules, variables]);

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
    ({ event, text = '', status, name, tool }: generatingMessageProps) => {
      setChatHistories((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1) return item;
          const lastValue = { ...item.value[item.value.length - 1] };

          if (event === sseResponseEventEnum.moduleStatus && status) {
            return {
              ...item,
              status,
              moduleName: name
            };
          } else if (event === sseResponseEventEnum.answer && text) {
            if (!lastValue || !lastValue.text) {
              return {
                ...item,
                value: item.value.concat({
                  type: ChatItemValueTypeEnum.text,
                  text: {
                    content: text
                  }
                })
              };
            } else {
              lastValue.text.content += text;
              return {
                ...item,
                value: item.value.slice(0, -1).concat(lastValue)
              };
            }
          } else if (event === sseResponseEventEnum.toolCall && tool) {
            const val = {
              type: ChatItemValueTypeEnum.tool,
              tools: [tool]
            };
            return {
              ...item,
              value:
                lastValue && lastValue.text
                  ? item.value.slice(0, -1).concat(val)
                  : item.value.concat(val)
            };
          } else if (event === sseResponseEventEnum.toolParams && tool && lastValue?.tools) {
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
          } else if (event === sseResponseEventEnum.toolResponse && tool && lastValue?.tools) {
            lastValue.tools = lastValue.tools.map((item) => {
              if (item.id === tool.id) {
                item.response += tool.response;
              }
              return item;
            });
            return {
              ...item,
              value: item.value.slice(0, -1).concat(lastValue)
            };
          }

          return item;
        })
      );
      generatingScroll();
    },
    [generatingScroll]
  );

  // 重置输入内容
  const resetInputVal = useCallback(({ text = '' }: ChatBoxInputType) => {
    if (!TextareaDom.current) return;

    setTimeout(() => {
      /* 回到最小高度 */
      if (TextareaDom.current) {
        TextareaDom.current.value = text;
        TextareaDom.current.style.height =
          text === '' ? textareaMinH : `${TextareaDom.current.scrollHeight}px`;
      }
    }, 100);
  }, []);

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
      history = chatHistories
    }: ChatBoxInputType & {
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
        questionGuideController.current?.abort('stop');
        text = text.trim();

        if (!text && files.length === 0) {
          toast({
            title: '内容为空',
            status: 'warning'
          });
          return;
        }

        const newChatList: ChatSiteItemType[] = [
          ...history,
          {
            dataId: getNanoid(24),
            obj: 'Human',
            value: [
              ...files.map((file) => ({
                type: ChatItemValueTypeEnum.file,
                file
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
            ],
            status: 'finish'
          },
          {
            dataId: getNanoid(24),
            obj: 'AI',
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
            chatList: newChatList.map((item) => ({
              dataId: item.dataId,
              obj: item.obj,
              value: item.value,
              status: item.status,
              moduleName: item.moduleName
            })),
            messages,
            controller: abortSignal,
            generatingMessage,
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
      })();
    },
    [
      chatHistories,
      createQuestionGuide,
      generatingMessage,
      generatingScroll,
      handleSubmit,
      isChatting,
      isPc,
      onStartChat,
      resetInputVal,
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
            delHistory.map(async (item) => {
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
  // delete one message
  const delOneMessage = useCallback(
    (dataId?: string) => {
      if (!dataId || !onDelMessage) return;
      return () => {
        setChatHistories((state) => state.filter((chat) => chat.dataId !== dataId));
        onDelMessage({
          contentId: dataId
        });
      };
    },
    [onDelMessage]
  );
  // admin mark
  const onMark = useCallback(
    (chat: ChatSiteItemType, q = '') => {
      if (!showMarkIcon) return;

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
      if (feedbackType !== FeedbackTypeEnum.user || chat.userBadFeedback) return;
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
            chatItemId: chat.dataId,
            shareId,
            outLinkUid,
            userGoodFeedback: isGoodFeedback ? undefined : 'yes'
          });
        } catch (error) {}
      };
    },
    [appId, chatId, feedbackType, outLinkUid, shareId]
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
          chatId,
          chatItemId: chat.dataId,
          userGoodFeedback: undefined
        });
      };
    },
    [appId, chatId, feedbackType]
  );
  const onADdUserDislike = useCallback(
    (chat: ChatSiteItemType) => {
      if (feedbackType !== FeedbackTypeEnum.user || chat.userGoodFeedback) {
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
              outLinkUid
            });
          } catch (error) {}
        };
      } else {
        return () => setFeedbackId(chat.dataId);
      }
    },
    [appId, chatId, feedbackType, outLinkUid, shareId]
  );
  const onReadUserDislike = useCallback(
    (chat: ChatSiteItemType) => {
      if (feedbackType !== FeedbackTypeEnum.admin) return;
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
              chatItem.dataId === chat.dataId
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
    const colorMap = {
      loading: 'myGray.700',
      running: '#67c13b',
      finish: 'primary.500'
    };
    if (!isChatting) return;
    const chatContent = chatHistories[chatHistories.length - 1];
    if (!chatContent) return;

    return {
      bg: colorMap[chatContent.status] || colorMap.loading,
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
      setVariableInputFinish(!!e.length);
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
                setVariableInputFinish(true);
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
                    isChatting={isChatting}
                    onRetry={retryInput(item.dataId)}
                    onDelete={delOneMessage(item.dataId)}
                  />
                )}
                {item.obj === 'AI' && (
                  <>
                    <ChatItem
                      type={item.obj}
                      avatar={appAvatar}
                      chat={item}
                      isChatting={isChatting}
                      onRetry={retryInput(item.dataId)}
                      onDelete={delOneMessage(item.dataId)}
                      {...(item.obj === 'AI' && {
                        setChatHistories,
                        showVoiceIcon,
                        ttsConfig,
                        shareId,
                        outLinkUid,
                        teamId,
                        teamToken,
                        statusBoxData,
                        isLastChild: index === chatHistories.length - 1,
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
                        responseData={item.responseData}
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
                          <Box whiteSpace={'pre'}>
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
          isChatting={isChatting}
          TextareaDom={TextareaDom}
          resetInputVal={resetInputVal}
          showFileSelector={showFileSelector}
          shareId={shareId}
          outLinkUid={outLinkUid}
          teamId={teamId}
          teamToken={teamToken}
        />
      )}
      {/* user feedback modal */}
      {!!feedbackId && chatId && appId && (
        <FeedbackModal
          appId={appId}
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

export default React.memo(forwardRef(ChatBox));
