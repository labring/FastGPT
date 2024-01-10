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
import type { ExportChatType } from '@/types/chat.d';
import type { ChatItemType, ChatSiteItemType } from '@fastgpt/global/core/chat/type.d';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { useToast } from '@/web/common/hooks/useToast';
import { useAudioPlay } from '@/web/common/utils/voice';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import {
  Box,
  Card,
  Flex,
  Input,
  Button,
  useTheme,
  BoxProps,
  FlexProps,
  Image,
  Textarea,
  Checkbox
} from '@chakra-ui/react';
import { feConfigs } from '@/web/common/system/staticData';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { adaptChat2GptMessages } from '@fastgpt/global/core/chat/adapt';
import { useMarkdown } from '@/web/common/hooks/useMarkdown';
import { ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { VariableInputEnum } from '@fastgpt/global/core/module/constants';
import { useForm } from 'react-hook-form';
import type { ChatMessageItemType } from '@fastgpt/global/core/ai/type.d';
import { fileDownload } from '@/web/common/file/utils';
import { htmlTemplate } from '@/constants/common';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { customAlphabet } from 'nanoid';
import {
  closeCustomFeedback,
  updateChatAdminFeedback,
  updateChatUserFeedback
} from '@/web/core/chat/api';
import type { AdminMarkType } from './SelectMarkCollection';

import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import Markdown, { CodeClassName } from '@/components/Markdown';
import MySelect from '@/components/Select';
import MyTooltip from '../MyTooltip';
import dynamic from 'next/dynamic';
const ResponseTags = dynamic(() => import('./ResponseTags'));
const FeedbackModal = dynamic(() => import('./FeedbackModal'));
const ReadFeedbackModal = dynamic(() => import('./ReadFeedbackModal'));
const SelectMarkCollection = dynamic(() => import('./SelectMarkCollection'));

import styles from './index.module.scss';
import { postQuestionGuide } from '@/web/core/ai/api';
import { splitGuideModule } from '@fastgpt/global/core/module/utils';
import type { AppTTSConfigType } from '@fastgpt/global/core/module/type.d';
import MessageInput from './MessageInput';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import ChatBoxDivider from '../core/chat/Divider';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

const textareaMinH = '22px';

type generatingMessageProps = { text?: string; name?: string; status?: 'running' | 'finish' };

export type StartChatFnProps = {
  chatList: ChatSiteItemType[];
  messages: ChatMessageItemType[];
  controller: AbortController;
  variables: Record<string, any>;
  generatingMessage: (e: generatingMessageProps) => void;
};

export type ComponentRef = {
  getChatHistories: () => ChatSiteItemType[];
  resetVariables: (data?: Record<string, any>) => void;
  resetHistory: (history: ChatSiteItemType[]) => void;
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
  sendPrompt: (question: string) => void;
};

enum FeedbackTypeEnum {
  user = 'user',
  admin = 'admin',
  hidden = 'hidden'
}

type Props = {
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
  shareId?: string;
  outLinkUid?: string;

  onUpdateVariable?: (e: Record<string, any>) => void;
  onStartChat?: (e: StartChatFnProps) => Promise<{
    responseText: string;
    [ModuleOutputKeyEnum.responseData]: ChatHistoryItemResType[];
    isNewChat?: boolean;
  }>;
  onDelMessage?: (e: { contentId?: string; index: number }) => void;
};

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
  const { isPc, setLoading } = useSystemStore();
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const chatController = useRef(new AbortController());
  const questionGuideController = useRef(new AbortController());
  const isNewChatReplace = useRef(false);

  const [refresh, setRefresh] = useState(false);
  const [variables, setVariables] = useState<Record<string, any>>({}); // settings variable
  const [chatHistory, setChatHistory] = useState<ChatSiteItemType[]>([]);
  const [feedbackId, setFeedbackId] = useState<string>();
  const [readFeedbackData, setReadFeedbackData] = useState<{
    chatItemId: string;
    content: string;
  }>();
  const [adminMarkData, setAdminMarkData] = useState<AdminMarkType & { chatItemId: string }>();
  const [questionGuides, setQuestionGuide] = useState<string[]>([]);

  const isChatting = useMemo(
    () =>
      chatHistory[chatHistory.length - 1] &&
      chatHistory[chatHistory.length - 1]?.status !== 'finish',
    [chatHistory]
  );

  const { welcomeText, variableModules, questionGuide, ttsConfig } = useMemo(
    () => splitGuideModule(userGuideModule),
    [userGuideModule]
  );

  // compute variable input is finish.
  const [variableInputFinish, setVariableInputFinish] = useState(false);
  const variableIsFinish = useMemo(() => {
    if (!variableModules || variableModules.length === 0 || chatHistory.length > 0) return true;

    for (let i = 0; i < variableModules.length; i++) {
      const item = variableModules[i];
      if (item.required && !variables[item.key]) {
        return false;
      }
    }

    return variableInputFinish;
  }, [chatHistory.length, variableInputFinish, variableModules, variables]);

  const { register, reset, getValues, setValue, handleSubmit } = useForm<Record<string, any>>({
    defaultValues: variables
  });

  // 滚动到底部
  const scrollToBottom = useCallback(
    (behavior: 'smooth' | 'auto' = 'smooth') => {
      if (!ChatBoxRef.current) return;
      ChatBoxRef.current.scrollTo({
        top: ChatBoxRef.current.scrollHeight,
        behavior
      });
    },
    [ChatBoxRef]
  );
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
  const generatingMessage = ({ text = '', status, name }: generatingMessageProps) => {
    setChatHistory((state) =>
      state.map((item, index) => {
        if (index !== state.length - 1) return item;
        return {
          ...item,
          ...(text
            ? {
                value: item.value + text
              }
            : {}),
          ...(status && name
            ? {
                status,
                moduleName: name
              }
            : {})
        };
      })
    );
    generatingScroll();
  };

  // 重置输入内容
  const resetInputVal = useCallback((val: string) => {
    if (!TextareaDom.current) return;

    setTimeout(() => {
      /* 回到最小高度 */
      if (TextareaDom.current) {
        TextareaDom.current.value = val;
        TextareaDom.current.style.height =
          val === '' ? textareaMinH : `${TextareaDom.current.scrollHeight}px`;
      }
      setRefresh((state) => !state);
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
            messages: adaptChat2GptMessages({ messages: history, reserveId: false }).slice(-6),
            shareId
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
    [questionGuide, scrollToBottom, shareId]
  );

  /**
   * user confirm send prompt
   */
  const sendPrompt = useCallback(
    async (variables: Record<string, any> = {}, inputVal = '', history = chatHistory) => {
      if (!onStartChat) return;
      if (isChatting) {
        toast({
          title: '正在聊天中...请等待结束',
          status: 'warning'
        });
        return;
      }
      questionGuideController.current?.abort('stop');
      // get input value
      const val = inputVal.trim();

      if (!val) {
        toast({
          title: '内容为空',
          status: 'warning'
        });
        return;
      }

      const newChatList: ChatSiteItemType[] = [
        ...history,
        {
          dataId: nanoid(),
          obj: 'Human',
          value: val,
          status: 'finish'
        },
        {
          dataId: nanoid(),
          obj: 'AI',
          value: '',
          status: 'loading'
        }
      ];

      // 插入内容
      setChatHistory(newChatList);

      // 清空输入内容
      resetInputVal('');
      setQuestionGuide([]);
      setTimeout(() => {
        scrollToBottom();
      }, 100);
      try {
        // create abort obj
        const abortSignal = new AbortController();
        chatController.current = abortSignal;

        const messages = adaptChat2GptMessages({ messages: newChatList, reserveId: true });

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
        setChatHistory((state) =>
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
                    value: responseText
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
          resetInputVal(inputVal);
          setChatHistory(newChatList.slice(0, newChatList.length - 2));
        }

        // set finish status
        setChatHistory((state) =>
          state.map((item, index) => {
            if (index !== state.length - 1) return item;
            return {
              ...item,
              status: 'finish'
            };
          })
        );
      }
    },
    [
      chatHistory,
      onStartChat,
      isChatting,
      resetInputVal,
      toast,
      scrollToBottom,
      generatingMessage,
      createQuestionGuide,
      generatingScroll,
      isPc,
      t
    ]
  );

  // retry input
  const retryInput = useCallback(
    async (index: number) => {
      if (!onDelMessage) return;
      const delHistory = chatHistory.slice(index);

      setLoading(true);

      try {
        await Promise.all(
          delHistory.map((item, i) => onDelMessage({ contentId: item.dataId, index: index + i }))
        );
        setChatHistory((state) => (index === 0 ? [] : state.slice(0, index)));

        sendPrompt(variables, delHistory[0].value, chatHistory.slice(0, index));
      } catch (error) {}
      setLoading(false);
    },
    [chatHistory, onDelMessage, sendPrompt, setLoading, variables]
  );
  // delete one message
  const delOneMessage = useCallback(
    ({ dataId, index }: { dataId?: string; index: number }) => {
      setChatHistory((state) => state.filter((chat) => chat.dataId !== dataId));
      onDelMessage?.({
        contentId: dataId,
        index
      });
    },
    [onDelMessage]
  );

  // output data
  useImperativeHandle(ref, () => ({
    getChatHistories: () => chatHistory,
    resetVariables(e) {
      const defaultVal: Record<string, any> = {};
      variableModules?.forEach((item) => {
        defaultVal[item.key] = '';
      });

      reset(e || defaultVal);
      setVariables(e || defaultVal);
    },
    resetHistory(e) {
      setVariableInputFinish(!!e.length);
      setChatHistory(e);
    },
    scrollToBottom,
    sendPrompt: (question: string) => handleSubmit((item) => sendPrompt(item, question))()
  }));

  /* style start */
  const MessageCardStyle: BoxProps = {
    px: 4,
    py: 3,
    borderRadius: '0 8px 8px 8px',
    boxShadow: '0 0 8px rgba(0,0,0,0.15)',
    display: 'inline-block',
    maxW: ['calc(100% - 25px)', 'calc(100% - 40px)']
  };

  const showEmpty = useMemo(
    () =>
      feConfigs?.show_emptyChat &&
      showEmptyIntro &&
      chatHistory.length === 0 &&
      !variableModules?.length &&
      !welcomeText,
    [chatHistory.length, showEmptyIntro, variableModules, welcomeText]
  );
  const statusBoxData = useMemo(() => {
    const colorMap = {
      loading: 'myGray.700',
      running: '#67c13b',
      finish: 'primary.500'
    };
    if (!isChatting) return;
    const chatContent = chatHistory[chatHistory.length - 1];
    if (!chatContent) return;

    return {
      bg: colorMap[chatContent.status] || colorMap.loading,
      name: t(chatContent.moduleName || '') || t('common.Loading')
    };
  }, [chatHistory, isChatting, t]);
  /* style end */

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
        handleSubmit((item) => sendPrompt(item, data.text))();
      }
    };
    window.addEventListener('message', windowMessage);

    eventBus.on(EventNameEnum.sendQuestion, ({ text }: { text: string }) => {
      if (!text) return;
      handleSubmit((data) => sendPrompt(data, text))();
    });
    eventBus.on(EventNameEnum.editQuestion, ({ text }: { text: string }) => {
      if (!text) return;
      resetInputVal(text);
    });

    return () => {
      window.removeEventListener('message', windowMessage);
      eventBus.off(EventNameEnum.sendQuestion);
      eventBus.off(EventNameEnum.editQuestion);
    };
  }, [handleSubmit, resetInputVal, sendPrompt]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Script src="/js/html2pdf.bundle.min.js" strategy="lazyOnload"></Script>

      {/* chat box container */}
      <Box ref={ChatBoxRef} flex={'1 0 0'} h={0} w={'100%'} overflow={'overlay'} px={[4, 0]} pb={3}>
        <Box id="chat-container" maxW={['100%', '92%']} h={'100%'} mx={'auto'}>
          {showEmpty && <Empty />}

          {!!welcomeText && (
            <Box py={3}>
              {/* avatar */}
              <ChatAvatar src={appAvatar} type={'AI'} />
              {/* message */}
              <Box textAlign={'left'}>
                <Card order={2} mt={2} {...MessageCardStyle} bg={'white'}>
                  <Markdown source={`~~~guide \n${welcomeText}`} isChatting={false} />
                </Card>
              </Box>
            </Box>
          )}
          {/* variable input */}
          {!!variableModules?.length && (
            <Box py={3}>
              {/* avatar */}
              <ChatAvatar src={appAvatar} type={'AI'} />
              {/* message */}
              <Box textAlign={'left'}>
                <Card order={2} mt={2} bg={'white'} w={'400px'} {...MessageCardStyle}>
                  {variableModules.map((item) => (
                    <Box key={item.id} mb={4}>
                      <VariableLabel required={item.required}>{item.label}</VariableLabel>
                      {item.type === VariableInputEnum.input && (
                        <Input
                          isDisabled={variableIsFinish}
                          bg={'myWhite.400'}
                          {...register(item.key, {
                            required: item.required
                          })}
                        />
                      )}
                      {item.type === VariableInputEnum.textarea && (
                        <Textarea
                          isDisabled={variableIsFinish}
                          bg={'myWhite.400'}
                          {...register(item.key, {
                            required: item.required
                          })}
                          rows={5}
                          maxLength={4000}
                        />
                      )}
                      {item.type === VariableInputEnum.select && (
                        <MySelect
                          width={'100%'}
                          isDisabled={variableIsFinish}
                          list={(item.enums || []).map((item) => ({
                            label: item.value,
                            value: item.value
                          }))}
                          {...register(item.key, {
                            required: item.required
                          })}
                          value={getValues(item.key)}
                          onchange={(e) => {
                            setValue(item.key, e);
                            setRefresh(!refresh);
                          }}
                        />
                      )}
                    </Box>
                  ))}
                  {!variableIsFinish && (
                    <Button
                      leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
                      size={'sm'}
                      maxW={'100px'}
                      onClick={handleSubmit((data) => {
                        onUpdateVariable?.(data);
                        setVariables(data);
                        setVariableInputFinish(true);
                      })}
                    >
                      {t('core.chat.Start Chat')}
                    </Button>
                  )}
                </Card>
              </Box>
            </Box>
          )}

          {/* chat history */}
          <Box id={'history'}>
            {chatHistory.map((item, index) => (
              <Box key={item.dataId} py={5}>
                {item.obj === 'Human' && (
                  <>
                    {/* control icon */}
                    <Flex w={'100%'} alignItems={'center'} justifyContent={'flex-end'}>
                      <ChatController
                        chat={item}
                        onDelete={
                          onDelMessage
                            ? () => {
                                delOneMessage({ dataId: item.dataId, index });
                              }
                            : undefined
                        }
                        onRetry={() => retryInput(index)}
                      />
                      <ChatAvatar src={userAvatar} type={'Human'} />
                    </Flex>
                    {/* content */}
                    <Box mt={['6px', 2]} textAlign={'right'}>
                      <Card
                        className="markdown"
                        {...MessageCardStyle}
                        bg={'primary.200'}
                        borderRadius={'8px 0 8px 8px'}
                        textAlign={'left'}
                      >
                        <Markdown source={item.value} isChatting={false} />
                      </Card>
                    </Box>
                  </>
                )}
                {item.obj === 'AI' && (
                  <>
                    {/* control icon */}
                    <Flex w={'100%'} alignItems={'center'}>
                      <ChatAvatar src={appAvatar} type={'AI'} />
                      <ChatController
                        ml={2}
                        chat={item}
                        setChatHistory={setChatHistory}
                        display={index === chatHistory.length - 1 && isChatting ? 'none' : 'flex'}
                        showVoiceIcon={showVoiceIcon}
                        ttsConfig={ttsConfig}
                        onDelete={
                          onDelMessage
                            ? () => {
                                delOneMessage({ dataId: item.dataId, index });
                              }
                            : undefined
                        }
                        onMark={
                          showMarkIcon
                            ? () => {
                                if (!item.dataId) return;
                                if (item.adminFeedback) {
                                  setAdminMarkData({
                                    chatItemId: item.dataId,
                                    datasetId: item.adminFeedback.datasetId,
                                    collectionId: item.adminFeedback.collectionId,
                                    dataId: item.adminFeedback.dataId,
                                    q: item.adminFeedback.q || chatHistory[index - 1]?.value || '',
                                    a: item.adminFeedback.a
                                  });
                                } else {
                                  setAdminMarkData({
                                    chatItemId: item.dataId,
                                    q: chatHistory[index - 1]?.value || '',
                                    a: item.value
                                  });
                                }
                              }
                            : undefined
                        }
                        onAddUserLike={(() => {
                          if (feedbackType !== FeedbackTypeEnum.user || item.userBadFeedback) {
                            return;
                          }
                          return () => {
                            if (!item.dataId || !chatId || !appId) return;

                            const isGoodFeedback = !!item.userGoodFeedback;
                            setChatHistory((state) =>
                              state.map((chatItem) =>
                                chatItem.dataId === item.dataId
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
                                chatItemId: item.dataId,
                                shareId,
                                outLinkUid,
                                userGoodFeedback: isGoodFeedback ? undefined : 'yes'
                              });
                            } catch (error) {}
                          };
                        })()}
                        onCloseUserLike={
                          feedbackType === FeedbackTypeEnum.admin
                            ? () => {
                                if (!item.dataId || !chatId || !appId) return;
                                setChatHistory((state) =>
                                  state.map((chatItem) =>
                                    chatItem.dataId === item.dataId
                                      ? { ...chatItem, userGoodFeedback: undefined }
                                      : chatItem
                                  )
                                );
                                updateChatUserFeedback({
                                  appId,
                                  chatId,
                                  chatItemId: item.dataId,
                                  userGoodFeedback: undefined
                                });
                              }
                            : undefined
                        }
                        onAddUserDislike={(() => {
                          if (feedbackType !== FeedbackTypeEnum.user || item.userGoodFeedback) {
                            return;
                          }
                          if (item.userBadFeedback) {
                            return () => {
                              if (!item.dataId || !chatId || !appId) return;
                              setChatHistory((state) =>
                                state.map((chatItem) =>
                                  chatItem.dataId === item.dataId
                                    ? { ...chatItem, userBadFeedback: undefined }
                                    : chatItem
                                )
                              );
                              try {
                                updateChatUserFeedback({
                                  appId,
                                  chatId,
                                  chatItemId: item.dataId,
                                  shareId,
                                  outLinkUid
                                });
                              } catch (error) {}
                            };
                          } else {
                            return () => setFeedbackId(item.dataId);
                          }
                        })()}
                        onReadUserDislike={
                          feedbackType === FeedbackTypeEnum.admin
                            ? () => {
                                if (!item.dataId) return;
                                setReadFeedbackData({
                                  chatItemId: item.dataId || '',
                                  content: item.userBadFeedback || ''
                                });
                              }
                            : undefined
                        }
                      />
                      {/* chatting status */}
                      {statusBoxData && index === chatHistory.length - 1 && (
                        <Flex
                          ml={3}
                          alignItems={'center'}
                          px={3}
                          py={'1px'}
                          borderRadius="md"
                          border={theme.borders.base}
                        >
                          <Box
                            className={styles.statusAnimation}
                            bg={statusBoxData.bg}
                            w="8px"
                            h="8px"
                            borderRadius={'50%'}
                            mt={'1px'}
                          ></Box>
                          <Box ml={2} color={'myGray.600'}>
                            {statusBoxData.name}
                          </Box>
                        </Flex>
                      )}
                    </Flex>
                    {/* content */}
                    <Box textAlign={'left'} mt={['6px', 2]}>
                      <Card bg={'white'} {...MessageCardStyle}>
                        <Markdown
                          source={(() => {
                            const text = item.value as string;

                            // replace quote tag: [source1] 标识第一个来源，需要提取数字1，从而去数组里查找来源
                            const quoteReg = /\[source:(.+)\]/g;
                            const replaceText = text.replace(quoteReg, `[QUOTE SIGN]($1)`);

                            // question guide
                            if (
                              index === chatHistory.length - 1 &&
                              !isChatting &&
                              questionGuides.length > 0
                            ) {
                              return `${replaceText}\n\`\`\`${
                                CodeClassName.questionGuide
                              }\n${JSON.stringify(questionGuides)}`;
                            }
                            return replaceText;
                          })()}
                          isChatting={index === chatHistory.length - 1 && isChatting}
                        />

                        <ResponseTags responseData={item.responseData} isShare={!!shareId} />

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
                                  <Checkbox
                                    onChange={(e) => {
                                      if (e.target.checked && appId && chatId && item.dataId) {
                                        closeCustomFeedback({
                                          appId,
                                          chatId,
                                          chatItemId: item.dataId,
                                          index: i
                                        });
                                        // update dom
                                        setChatHistory((state) =>
                                          state.map((chatItem) =>
                                            chatItem.dataId === item.dataId
                                              ? {
                                                  ...chatItem,
                                                  customFeedbacks: chatItem.customFeedbacks?.filter(
                                                    (item, index) => index !== i
                                                  )
                                                }
                                              : chatItem
                                          )
                                        );
                                      }
                                      console.log(e);
                                    }}
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
                              text={t('core.chat.Admin Mark Content')}
                            />
                            <Box whiteSpace={'pre'}>
                              <Box color={'black'}>{item.adminFeedback.q}</Box>
                              <Box color={'myGray.600'}>{item.adminFeedback.a}</Box>
                            </Box>
                          </Box>
                        )}
                      </Card>
                    </Box>
                  </>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      {/* message input */}
      {onStartChat && variableIsFinish && active ? (
        <MessageInput
          onChange={(e) => {
            setRefresh(!refresh);
          }}
          onSendMessage={(e) => {
            handleSubmit((data) => sendPrompt(data, e))();
          }}
          onStop={() => chatController.current?.abort('stop')}
          isChatting={isChatting}
          TextareaDom={TextareaDom}
          resetInputVal={resetInputVal}
          showFileSelector={showFileSelector}
        />
      ) : null}
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
            setChatHistory((state) =>
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
            setChatHistory((state) =>
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
            console.log(adminMarkData);
            if (!appId || !chatId || !adminMarkData.chatItemId) return;
            updateChatAdminFeedback({
              appId,
              chatId,
              chatItemId: adminMarkData.chatItemId,
              ...adminFeedback
            });

            // update dom
            setChatHistory((state) =>
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
              setChatHistory((state) =>
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

export const useChatBox = () => {
  const onExportChat = useCallback(
    ({ type, history }: { type: ExportChatType; history: ChatItemType[] }) => {
      const getHistoryHtml = () => {
        const historyDom = document.getElementById('history');
        if (!historyDom) return;
        const dom = Array.from(historyDom.children).map((child, i) => {
          const avatar = `<img src="${child.querySelector<HTMLImageElement>('.avatar')
            ?.src}" alt="" />`;

          const chatContent = child.querySelector<HTMLDivElement>('.markdown');

          if (!chatContent) {
            return '';
          }

          const chatContentClone = chatContent.cloneNode(true) as HTMLDivElement;

          const codeHeader = chatContentClone.querySelectorAll('.code-header');
          codeHeader.forEach((childElement: any) => {
            childElement.remove();
          });

          return `<div class="chat-item">
          ${avatar}
          ${chatContentClone.outerHTML}
        </div>`;
        });

        const html = htmlTemplate.replace('{{CHAT_CONTENT}}', dom.join('\n'));
        return html;
      };

      const map: Record<ExportChatType, () => void> = {
        md: () => {
          fileDownload({
            text: history.map((item) => item.value).join('\n\n'),
            type: 'text/markdown',
            filename: 'chat.md'
          });
        },
        html: () => {
          const html = getHistoryHtml();
          html &&
            fileDownload({
              text: html,
              type: 'text/html',
              filename: '聊天记录.html'
            });
        },
        pdf: () => {
          const html = getHistoryHtml();

          html &&
            // @ts-ignore
            html2pdf(html, {
              margin: 0,
              filename: `聊天记录.pdf`
            });
        }
      };

      map[type]();
    },
    []
  );

  return {
    onExportChat
  };
};

function VariableLabel({
  required = false,
  children
}: {
  required?: boolean;
  children: React.ReactNode | string;
}) {
  return (
    <Box as={'label'} display={'inline-block'} position={'relative'} mb={1}>
      {children}
      {required && (
        <Box
          position={'absolute'}
          top={'-2px'}
          right={'-10px'}
          color={'red.500'}
          fontWeight={'bold'}
        >
          *
        </Box>
      )}
    </Box>
  );
}
function ChatAvatar({ src, type }: { src?: string; type: 'Human' | 'AI' }) {
  const theme = useTheme();
  return (
    <Box
      w={['28px', '34px']}
      h={['28px', '34px']}
      p={'2px'}
      borderRadius={'sm'}
      border={theme.borders.base}
      boxShadow={'0 0 5px rgba(0,0,0,0.1)'}
      bg={type === 'Human' ? 'white' : 'primary.50'}
    >
      <Avatar src={src} w={'100%'} h={'100%'} />
    </Box>
  );
}

function Empty() {
  const { data: chatProblem } = useMarkdown({ url: '/chatProblem.md' });
  const { data: versionIntro } = useMarkdown({ url: '/versionIntro.md' });

  return (
    <Box pt={6} w={'85%'} maxW={'600px'} m={'auto'} alignItems={'center'} justifyContent={'center'}>
      {/* version intro */}
      <Card p={4} mb={10} minH={'200px'}>
        <Markdown source={versionIntro} />
      </Card>
      <Card p={4} minH={'600px'}>
        <Markdown source={chatProblem} />
      </Card>
    </Box>
  );
}

function ChatController({
  chat,
  setChatHistory,
  display,
  showVoiceIcon,
  ttsConfig,
  onReadUserDislike,
  onCloseUserLike,
  onMark,
  onRetry,
  onDelete,
  onAddUserDislike,
  onAddUserLike,
  ml,
  mr
}: {
  chat: ChatSiteItemType;
  setChatHistory?: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  showVoiceIcon?: boolean;
  ttsConfig?: AppTTSConfigType;
  onRetry?: () => void;
  onDelete?: () => void;
  onMark?: () => void;
  onReadUserDislike?: () => void;
  onCloseUserLike?: () => void;
  onAddUserLike?: () => void;
  onAddUserDislike?: () => void;
} & FlexProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { audioLoading, audioPlaying, hasAudio, playAudio, cancelAudio } = useAudioPlay({
    ttsConfig
  });
  const controlIconStyle = {
    w: '14px',
    cursor: 'pointer',
    p: 1,
    bg: 'white',
    borderRadius: 'md',
    boxShadow: '0 0 5px rgba(0,0,0,0.1)',
    border: theme.borders.base,
    mr: 3
  };
  const controlContainerStyle = {
    className: 'control',
    color: 'myGray.400',
    display: 'flex',
    pl: 1
  };

  return (
    <Flex {...controlContainerStyle} ml={ml} mr={mr} display={display}>
      <MyTooltip label={'复制'}>
        <MyIcon
          {...controlIconStyle}
          name={'copy'}
          _hover={{ color: 'primary.600' }}
          onClick={() => copyData(chat.value)}
        />
      </MyTooltip>
      {!!onDelete && (
        <>
          {onRetry && (
            <MyTooltip label={t('core.chat.retry')}>
              <MyIcon
                {...controlIconStyle}
                name={'common/retryLight'}
                _hover={{ color: 'green.500' }}
                onClick={onRetry}
              />
            </MyTooltip>
          )}
          <MyTooltip label={'删除'}>
            <MyIcon
              {...controlIconStyle}
              name={'delete'}
              _hover={{ color: 'red.600' }}
              onClick={onDelete}
            />
          </MyTooltip>
        </>
      )}
      {showVoiceIcon &&
        hasAudio &&
        (audioLoading ? (
          <MyTooltip label={'加载中...'}>
            <MyIcon {...controlIconStyle} name={'common/loading'} />
          </MyTooltip>
        ) : audioPlaying ? (
          <Flex alignItems={'center'} mr={2}>
            <MyTooltip label={t('core.chat.tts.Stop Speech')}>
              <MyIcon
                {...controlIconStyle}
                mr={1}
                name={'core/chat/stopSpeech'}
                color={'#E74694'}
                onClick={() => cancelAudio()}
              />
            </MyTooltip>
            <Image src="/icon/speaking.gif" w={'23px'} alt={''} />
          </Flex>
        ) : (
          <MyTooltip label={t('core.app.TTS')}>
            <MyIcon
              {...controlIconStyle}
              name={'common/voiceLight'}
              _hover={{ color: '#E74694' }}
              onClick={async () => {
                const response = await playAudio({
                  buffer: chat.ttsBuffer,
                  chatItemId: chat.dataId,
                  text: chat.value
                });

                if (!setChatHistory || !response.buffer) return;
                setChatHistory((state) =>
                  state.map((item) =>
                    item.dataId === chat.dataId
                      ? {
                          ...item,
                          ttsBuffer: response.buffer
                        }
                      : item
                  )
                );
              }}
            />
          </MyTooltip>
        ))}
      {!!onMark && (
        <MyTooltip label={t('core.chat.Mark')}>
          <MyIcon
            {...controlIconStyle}
            name={'core/app/markLight'}
            _hover={{ color: '#67c13b' }}
            onClick={onMark}
          />
        </MyTooltip>
      )}
      {!!onCloseUserLike && chat.userGoodFeedback && (
        <MyTooltip label={t('core.chat.feedback.Close User Like')}>
          <MyIcon
            {...controlIconStyle}
            color={'white'}
            bg={'green.500'}
            fontWeight={'bold'}
            name={'core/chat/feedback/goodLight'}
            onClick={onCloseUserLike}
          />
        </MyTooltip>
      )}
      {!!onReadUserDislike && chat.userBadFeedback && (
        <MyTooltip label={t('core.chat.feedback.Read User dislike')}>
          <MyIcon
            {...controlIconStyle}
            color={'white'}
            bg={'#FC9663'}
            fontWeight={'bold'}
            name={'core/chat/feedback/badLight'}
            onClick={onReadUserDislike}
          />
        </MyTooltip>
      )}
      {!!onAddUserLike && (
        <MyIcon
          {...controlIconStyle}
          {...(!!chat.userGoodFeedback
            ? {
                color: 'white',
                bg: 'green.500',
                fontWeight: 'bold'
              }
            : {
                _hover: { color: 'green.600' }
              })}
          name={'core/chat/feedback/goodLight'}
          onClick={onAddUserLike}
        />
      )}
      {!!onAddUserDislike && (
        <MyIcon
          {...controlIconStyle}
          {...(!!chat.userBadFeedback
            ? {
                color: 'white',
                bg: '#FC9663',
                fontWeight: 'bold',
                onClick: onAddUserDislike
              }
            : {
                _hover: { color: '#FB7C3C' },
                onClick: onAddUserDislike
              })}
          name={'core/chat/feedback/badLight'}
        />
      )}
    </Flex>
  );
}
