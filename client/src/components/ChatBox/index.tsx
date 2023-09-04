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
import { throttle } from 'lodash';
import {
  ChatHistoryItemResType,
  ChatItemType,
  ChatSiteItemType,
  ExportChatType
} from '@/types/chat';
import { useToast } from '@/hooks/useToast';
import {
  useCopyData,
  voiceBroadcast,
  cancelBroadcast,
  hasVoiceApi,
  getErrText
} from '@/utils/tools';
import { Box, Card, Flex, Input, Textarea, Button, useTheme, BoxProps } from '@chakra-ui/react';
import { feConfigs } from '@/store/static';
import { event } from '@/utils/plugin/eventbus';

import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { useMarkdown } from '@/hooks/useMarkdown';
import { VariableItemType } from '@/types/app';
import { VariableInputEnum } from '@/constants/app';
import { useForm } from 'react-hook-form';
import { MessageItemType } from '@/pages/api/openapi/v1/chat/completions';
import { fileDownload } from '@/utils/file';
import { htmlTemplate } from '@/constants/common';
import { useRouter } from 'next/router';
import { useGlobalStore } from '@/store/global';
import { TaskResponseKeyEnum, getDefaultChatVariables } from '@/constants/chat';
import { useTranslation } from 'react-i18next';
import { customAlphabet } from 'nanoid';
import { userUpdateChatFeedback, adminUpdateChatFeedback } from '@/api/chat';

import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';
import Markdown from '@/components/Markdown';
import MySelect from '@/components/Select';
import MyTooltip from '../MyTooltip';
import dynamic from 'next/dynamic';
const ResponseTags = dynamic(() => import('./ResponseTags'));
const FeedbackModal = dynamic(() => import('./FeedbackModal'));
const ReadFeedbackModal = dynamic(() => import('./ReadFeedbackModal'));
const SelectDataset = dynamic(() => import('./SelectDataset'));
const InputDataModal = dynamic(() => import('@/pages/kb/detail/components/InputDataModal'));

import styles from './index.module.scss';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

const textareaMinH = '22px';
type generatingMessageProps = { text?: string; name?: string; status?: 'running' | 'finish' };
export type StartChatFnProps = {
  chatList: ChatSiteItemType[];
  messages: MessageItemType[];
  controller: AbortController;
  variables: Record<string, any>;
  generatingMessage: (e: generatingMessageProps) => void;
};

export type ComponentRef = {
  getChatHistory: () => ChatSiteItemType[];
  resetVariables: (data?: Record<string, any>) => void;
  resetHistory: (chatId: ChatSiteItemType[]) => void;
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
};

enum FeedbackTypeEnum {
  user = 'user',
  admin = 'admin',
  hidden = 'hidden'
}

const VariableLabel = ({
  required = false,
  children
}: {
  required?: boolean;
  children: React.ReactNode | string;
}) => (
  <Box as={'label'} display={'inline-block'} position={'relative'} mb={1}>
    {children}
    {required && (
      <Box position={'absolute'} top={'-2px'} right={'-10px'} color={'red.500'} fontWeight={'bold'}>
        *
      </Box>
    )}
  </Box>
);

const Empty = () => {
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
};

const ChatAvatar = ({ src, type }: { src?: string; type: 'Human' | 'AI' }) => {
  const theme = useTheme();
  return (
    <Box
      w={['28px', '34px']}
      h={['28px', '34px']}
      p={'2px'}
      borderRadius={'lg'}
      border={theme.borders.base}
      boxShadow={'0 0 5px rgba(0,0,0,0.1)'}
      bg={type === 'Human' ? 'white' : 'myBlue.100'}
    >
      <Avatar src={src} w={'100%'} h={'100%'} />
    </Box>
  );
};

const ChatBox = (
  {
    feedbackType = FeedbackTypeEnum.hidden,
    showMarkIcon = false,
    showVoiceIcon = true,
    showEmptyIntro = false,
    chatId,
    appAvatar,
    userAvatar,
    variableModules,
    welcomeText,
    onUpdateVariable,
    onStartChat,
    onDelMessage
  }: {
    feedbackType?: `${FeedbackTypeEnum}`;
    showMarkIcon?: boolean;
    showVoiceIcon?: boolean;
    showEmptyIntro?: boolean;
    chatId?: string;
    appAvatar?: string;
    userAvatar?: string;
    variableModules?: VariableItemType[];
    welcomeText?: string;
    onUpdateVariable?: (e: Record<string, any>) => void;
    onStartChat?: (e: StartChatFnProps) => Promise<{
      responseText: string;
      [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType[];
    }>;
    onDelMessage?: (e: { contentId?: string; index: number }) => void;
  },
  ref: ForwardedRef<ComponentRef>
) => {
  const ChatBoxRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { toast } = useToast();
  const { isPc } = useGlobalStore();
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const controller = useRef(new AbortController());

  const [refresh, setRefresh] = useState(false);
  const [variables, setVariables] = useState<Record<string, any>>({});
  const [chatHistory, setChatHistory] = useState<ChatSiteItemType[]>([]);
  const [feedbackId, setFeedbackId] = useState<string>();
  const [readFeedbackData, setReadFeedbackData] = useState<{
    chatItemId: string;
    content: string;
    isMarked: boolean;
  }>();
  const [adminMarkData, setAdminMarkData] = useState<{
    kbId?: string;
    chatItemId: string;
    dataId?: string;
    q: string;
    a: string;
  }>();

  const isChatting = useMemo(
    () =>
      chatHistory[chatHistory.length - 1] &&
      chatHistory[chatHistory.length - 1]?.status !== 'finish',
    [chatHistory]
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
  const generatingMessage = useCallback(
    ({ text = '', status, name }: generatingMessageProps) => {
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
    },
    [generatingScroll, setChatHistory]
  );

  // 复制内容
  const onclickCopy = useCallback(
    (value: string) => {
      copyData(value);
    },
    [copyData]
  );

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
    }, 100);
  }, []);

  /**
   * user confirm send prompt
   */
  const sendPrompt = useCallback(
    async (variables: Record<string, any> = {}, inputVal = '') => {
      if (!onStartChat) return;
      if (isChatting) {
        toast({
          title: '正在聊天中...请等待结束',
          status: 'warning'
        });
        return;
      }
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
        ...chatHistory,
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
      setTimeout(() => {
        scrollToBottom();
      }, 100);

      try {
        // create abort obj
        const abortSignal = new AbortController();
        controller.current = abortSignal;

        const messages = adaptChatItem_openAI({ messages: newChatList, reserveId: true });

        const { responseData } = await onStartChat({
          chatList: newChatList,
          messages,
          controller: abortSignal,
          generatingMessage,
          variables: {
            ...getDefaultChatVariables(),
            ...variables
          }
        });

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
          generatingScroll();
          isPc && TextareaDom.current?.focus();
        }, 100);
      } catch (err: any) {
        toast({
          title: getErrText(err, '聊天出错了~'),
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
      isChatting,
      chatHistory,
      resetInputVal,
      toast,
      scrollToBottom,
      onStartChat,
      generatingMessage,
      generatingScroll,
      isPc
    ]
  );

  // output data
  useImperativeHandle(ref, () => ({
    getChatHistory: () => chatHistory,
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
    scrollToBottom
  }));

  const controlIconStyle = {
    w: '14px',
    cursor: 'pointer',
    p: 1,
    bg: 'white',
    borderRadius: 'lg',
    boxShadow: '0 0 5px rgba(0,0,0,0.1)',
    border: theme.borders.base,
    mr: 3
  };
  const controlContainerStyle = useCallback((status: ChatSiteItemType['status']) => {
    return {
      className: 'control',
      color: 'myGray.400',
      display:
        status === 'finish'
          ? feedbackType === FeedbackTypeEnum.admin
            ? 'flex'
            : ['flex', 'none']
          : 'none',
      pl: 1,
      mt: 2
    };
  }, []);
  const MessageCardStyle: BoxProps = {
    px: 4,
    py: 3,
    borderRadius: '0 8px 8px 8px',
    boxShadow: '0 0 8px rgba(0,0,0,0.15)'
  };

  const messageCardMaxW = ['calc(100% - 25px)', 'calc(100% - 40px)'];

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
      loading: '#67c13b',
      running: '#67c13b',
      finish: 'myBlue.600'
    };
    if (!isChatting) return;
    const chatContent = chatHistory[chatHistory.length - 1];
    if (!chatContent) return;

    return {
      bg: colorMap[chatContent.status] || colorMap.loading,
      name: t(chatContent.moduleName || 'Running')
    };
  }, [chatHistory, isChatting, t]);

  useEffect(() => {
    return () => {
      controller.current?.abort('leave');
      // close voice
      cancelBroadcast();
    };
  }, [router.query]);

  useEffect(() => {
    event.on('guideClick', ({ text }: { text: string }) => {
      if (!text) return;
      handleSubmit((data) => sendPrompt(data, text))();
    });

    return () => {
      event.off('guideClick');
    };
  }, [handleSubmit, sendPrompt]);
  useEffect(() => {
    const listen = () => {
      cancelBroadcast();
    };
    window.addEventListener('beforeunload', listen);

    return () => {
      window.removeEventListener('beforeunload', listen);
    };
  }, []);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Box ref={ChatBoxRef} flex={'1 0 0'} h={0} w={'100%'} overflow={'overlay'} px={[4, 0]} pb={3}>
        <Box maxW={['100%', '92%']} h={'100%'} mx={'auto'}>
          {showEmpty && <Empty />}

          {!!welcomeText && (
            <Flex flexDirection={'column'} alignItems={'flex-start'} py={2}>
              {/* avatar */}
              <ChatAvatar src={appAvatar} type={'AI'} />
              {/* message */}
              <Card order={2} mt={2} {...MessageCardStyle} bg={'white'} maxW={messageCardMaxW}>
                <Markdown source={`~~~guide \n${welcomeText}`} isChatting={false} />
              </Card>
            </Flex>
          )}
          {/* variable input */}
          {!!variableModules?.length && (
            <Flex flexDirection={'column'} alignItems={'flex-start'} py={2}>
              {/* avatar */}
              <ChatAvatar src={appAvatar} type={'AI'} />
              {/* message */}
              <Card
                order={2}
                mt={2}
                bg={'white'}
                w={'400px'}
                maxW={messageCardMaxW}
                {...MessageCardStyle}
              >
                {variableModules.map((item) => (
                  <Box key={item.id} mb={4}>
                    <VariableLabel required={item.required}>{item.label}</VariableLabel>
                    {item.type === VariableInputEnum.input && (
                      <Input
                        isDisabled={variableIsFinish}
                        {...register(item.key, {
                          required: item.required
                        })}
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
                    leftIcon={<MyIcon name={'chatFill'} w={'16px'} />}
                    size={'sm'}
                    maxW={'100px'}
                    borderRadius={'lg'}
                    onClick={handleSubmit((data) => {
                      onUpdateVariable?.(data);
                      setVariables(data);
                      setVariableInputFinish(true);
                    })}
                  >
                    {'开始对话'}
                  </Button>
                )}
              </Card>
            </Flex>
          )}

          {/* chat history */}
          <Box id={'history'}>
            {chatHistory.map((item, index) => (
              <Flex
                position={'relative'}
                key={item.dataId}
                flexDirection={'column'}
                alignItems={item.obj === 'Human' ? 'flex-end' : 'flex-start'}
                py={5}
                _hover={{
                  '& .control': {
                    display: item.status === 'finish' ? 'flex' : 'none'
                  }
                }}
              >
                {item.obj === 'Human' && (
                  <>
                    <Flex w={'100%'} alignItems={'center'} justifyContent={'flex-end'}>
                      <Flex
                        {...controlContainerStyle(item.status)}
                        justifyContent={'flex-end'}
                        mr={3}
                      >
                        <MyTooltip label={'复制'}>
                          <MyIcon
                            {...controlIconStyle}
                            name={'copy'}
                            _hover={{ color: 'myBlue.700' }}
                            onClick={() => onclickCopy(item.value)}
                          />
                        </MyTooltip>
                        {onDelMessage && (
                          <MyTooltip label={'删除'}>
                            <MyIcon
                              {...controlIconStyle}
                              mr={0}
                              name={'delete'}
                              _hover={{ color: 'red.600' }}
                              onClick={() => {
                                setChatHistory((state) =>
                                  state.filter((chat) => chat.dataId !== item.dataId)
                                );
                                onDelMessage({
                                  contentId: item.dataId,
                                  index
                                });
                              }}
                            />
                          </MyTooltip>
                        )}
                      </Flex>
                      <ChatAvatar src={userAvatar} type={'Human'} />
                    </Flex>
                    <Box position={'relative'} maxW={messageCardMaxW} mt={['6px', 2]}>
                      <Card
                        className="markdown"
                        whiteSpace={'pre-wrap'}
                        {...MessageCardStyle}
                        bg={'myBlue.300'}
                        borderRadius={'8px 0 8px 8px'}
                      >
                        <Box as={'p'}>{item.value}</Box>
                      </Card>
                    </Box>
                  </>
                )}
                {item.obj === 'AI' && (
                  <>
                    <Flex w={'100%'} alignItems={'flex-end'}>
                      <ChatAvatar src={appAvatar} type={'AI'} />
                      <Flex {...controlContainerStyle(item.status)} ml={3}>
                        <MyTooltip label={'复制'}>
                          <MyIcon
                            {...controlIconStyle}
                            name={'copy'}
                            _hover={{ color: 'myBlue.700' }}
                            onClick={() => onclickCopy(item.value)}
                          />
                        </MyTooltip>
                        {onDelMessage && (
                          <MyTooltip label={'删除'}>
                            <MyIcon
                              {...controlIconStyle}
                              name={'delete'}
                              _hover={{ color: 'red.600' }}
                              onClick={() => {
                                setChatHistory((state) =>
                                  state.filter((chat) => chat.dataId !== item.dataId)
                                );
                                onDelMessage({
                                  contentId: item.dataId,
                                  index
                                });
                              }}
                            />
                          </MyTooltip>
                        )}
                        {showVoiceIcon && hasVoiceApi && (
                          <MyTooltip label={'语音播报'}>
                            <MyIcon
                              {...controlIconStyle}
                              name={'voice'}
                              _hover={{ color: '#E74694' }}
                              onClick={() => voiceBroadcast({ text: item.value })}
                            />
                          </MyTooltip>
                        )}
                        {/* admin mark icon */}
                        {showMarkIcon && (
                          <MyTooltip label={t('chat.Mark')}>
                            <MyIcon
                              {...controlIconStyle}
                              name={'markLight'}
                              _hover={{ color: '#67c13b' }}
                              onClick={() => {
                                if (!item.dataId) return;
                                if (item.adminFeedback) {
                                  setAdminMarkData({
                                    chatItemId: item.dataId,
                                    kbId: item.adminFeedback.kbId,
                                    dataId: item.adminFeedback.dataId,
                                    q: chatHistory[index - 1]?.value || '',
                                    a: item.adminFeedback.content
                                  });
                                } else {
                                  setAdminMarkData({
                                    chatItemId: item.dataId,
                                    q: chatHistory[index - 1]?.value || '',
                                    a: item.value
                                  });
                                }
                              }}
                            />
                          </MyTooltip>
                        )}
                        {feedbackType === FeedbackTypeEnum.admin && (
                          <MyTooltip label={t('chat.Read User Feedback')}>
                            <MyIcon
                              display={item.userFeedback ? 'block' : 'none'}
                              {...controlIconStyle}
                              color={'white'}
                              bg={'#FC9663'}
                              fontWeight={'bold'}
                              name={'badLight'}
                              onClick={() =>
                                setReadFeedbackData({
                                  chatItemId: item.dataId || '',
                                  content: item.userFeedback || '',
                                  isMarked: !!item.adminFeedback
                                })
                              }
                            />
                          </MyTooltip>
                        )}
                        {feedbackType === FeedbackTypeEnum.user && (
                          <MyTooltip
                            label={
                              item.userFeedback
                                ? `取消反馈。\n您当前反馈内容为:\n${item.userFeedback}`
                                : '反馈'
                            }
                          >
                            <MyIcon
                              {...controlIconStyle}
                              {...(!!item.userFeedback
                                ? {
                                    color: 'white',
                                    bg: '#FC9663',
                                    fontWeight: 'bold',
                                    onClick: () => {
                                      if (!item.dataId) return;
                                      setChatHistory((state) =>
                                        state.map((chatItem) =>
                                          chatItem.dataId === item.dataId
                                            ? { ...chatItem, userFeedback: undefined }
                                            : chatItem
                                        )
                                      );
                                      try {
                                        userUpdateChatFeedback({ chatItemId: item.dataId });
                                      } catch (error) {}
                                    }
                                  }
                                : {
                                    _hover: { color: '#FB7C3C' },
                                    onClick: () => setFeedbackId(item.dataId)
                                  })}
                              name={'badLight'}
                            />
                          </MyTooltip>
                        )}
                      </Flex>
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
                    <Box position={'relative'} maxW={messageCardMaxW} mt={['6px', 2]}>
                      <Card bg={'white'} {...MessageCardStyle}>
                        <Markdown
                          source={item.value}
                          isChatting={index === chatHistory.length - 1 && isChatting}
                        />
                        <ResponseTags
                          chatId={chatId}
                          contentId={item.dataId}
                          responseData={item.responseData}
                        />
                        {/* admin mark content */}
                        {showMarkIcon && item.adminFeedback && (
                          <Box>
                            <Flex alignItems={'center'} py={2}>
                              <MyIcon name={'markLight'} w={'14px'} color={'myGray.900'} />
                              <Box ml={2} color={'myGray.500'}>
                                {t('chat.Admin Mark Content')}
                              </Box>
                              <Box h={'1px'} bg={'myGray.300'} flex={'1'} />
                            </Flex>
                            <Box>{item.adminFeedback.content}</Box>
                          </Box>
                        )}
                      </Card>
                    </Box>
                  </>
                )}
              </Flex>
            ))}
          </Box>
        </Box>
      </Box>
      {/* input */}
      {onStartChat && variableIsFinish ? (
        <Box m={['0 auto', '10px auto']} w={'100%'} maxW={['auto', 'min(750px, 100%)']} px={[0, 5]}>
          <Box
            py={'18px'}
            position={'relative'}
            boxShadow={`0 0 10px rgba(0,0,0,0.2)`}
            borderTop={['1px solid', 0]}
            borderTopColor={'myGray.200'}
            borderRadius={['none', 'md']}
            backgroundColor={'white'}
          >
            {/* 输入框 */}
            <Textarea
              ref={TextareaDom}
              py={0}
              pr={['45px', '55px']}
              border={'none'}
              _focusVisible={{
                border: 'none'
              }}
              placeholder="提问"
              resize={'none'}
              rows={1}
              height={'22px'}
              lineHeight={'22px'}
              maxHeight={'150px'}
              maxLength={-1}
              overflowY={'auto'}
              whiteSpace={'pre-wrap'}
              wordBreak={'break-all'}
              boxShadow={'none !important'}
              color={'myGray.900'}
              onChange={(e) => {
                const textarea = e.target;
                textarea.style.height = textareaMinH;
                textarea.style.height = `${textarea.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                // 触发快捷发送
                if (isPc && e.keyCode === 13 && !e.shiftKey) {
                  handleSubmit((data) => sendPrompt(data, TextareaDom.current?.value))();
                  e.preventDefault();
                }
                // 全选内容
                // @ts-ignore
                e.key === 'a' && e.ctrlKey && e.target?.select();
              }}
            />
            {/* 发送和等待按键 */}
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              h={'25px'}
              w={'25px'}
              position={'absolute'}
              right={['12px', '20px']}
              bottom={'15px'}
            >
              {isChatting ? (
                <MyIcon
                  className={styles.stopIcon}
                  width={['22px', '25px']}
                  height={['22px', '25px']}
                  cursor={'pointer'}
                  name={'stop'}
                  color={'gray.500'}
                  onClick={() => controller.current?.abort('stop')}
                />
              ) : (
                <MyIcon
                  name={'chatSend'}
                  width={['18px', '20px']}
                  height={['18px', '20px']}
                  cursor={'pointer'}
                  color={'gray.500'}
                  onClick={() => {
                    handleSubmit((data) => sendPrompt(data, TextareaDom.current?.value))();
                  }}
                />
              )}
            </Flex>
          </Box>
        </Box>
      ) : null}

      {/* user feedback modal */}
      {!!feedbackId && (
        <FeedbackModal
          chatItemId={feedbackId}
          onClose={() => setFeedbackId(undefined)}
          onSuccess={(content: string) => {
            setChatHistory((state) =>
              state.map((item) =>
                item.dataId === feedbackId ? { ...item, userFeedback: content } : item
              )
            );
            setFeedbackId(undefined);
          }}
        />
      )}
      {/* admin read feedback modal */}
      {!!readFeedbackData && (
        <ReadFeedbackModal
          {...readFeedbackData}
          onClose={() => setReadFeedbackData(undefined)}
          onMark={() => {
            const index = chatHistory.findIndex(
              (item) => item.dataId === readFeedbackData.chatItemId
            );
            if (index === -1) return setReadFeedbackData(undefined);
            setAdminMarkData({
              chatItemId: readFeedbackData.chatItemId,
              q: chatHistory[index - 1]?.value || '',
              a: chatHistory[index]?.value || ''
            });
          }}
          onSuccess={() => {
            setChatHistory((state) =>
              state.map((chatItem) =>
                chatItem.dataId === readFeedbackData.chatItemId
                  ? { ...chatItem, userFeedback: undefined }
                  : chatItem
              )
            );
            setReadFeedbackData(undefined);
          }}
        />
      )}
      {/* select one dataset to insert markData */}
      {adminMarkData && !adminMarkData.kbId && (
        <SelectDataset
          onClose={() => setAdminMarkData(undefined)}
          // @ts-ignore
          onSuccess={(kbId) => setAdminMarkData((state) => ({ ...state, kbId }))}
        />
      )}
      {/* edit markData modal */}
      {adminMarkData && adminMarkData.kbId && (
        <InputDataModal
          onClose={() => setAdminMarkData(undefined)}
          onSuccess={async (data) => {
            if (!adminMarkData.kbId || !data.dataId) {
              return setAdminMarkData(undefined);
            }
            const adminFeedback = {
              kbId: adminMarkData.kbId,
              dataId: data.dataId,
              content: data.a
            };

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
            // request to update adminFeedback
            try {
              adminUpdateChatFeedback({
                chatItemId: adminMarkData.chatItemId,
                ...adminFeedback
              });

              if (readFeedbackData) {
                userUpdateChatFeedback({
                  chatItemId: readFeedbackData.chatItemId,
                  userFeedback: undefined
                });
                setChatHistory((state) =>
                  state.map((chatItem) =>
                    chatItem.dataId === readFeedbackData.chatItemId
                      ? { ...chatItem, userFeedback: undefined }
                      : chatItem
                  )
                );
                setReadFeedbackData(undefined);
              }
            } catch (error) {}
            setAdminMarkData(undefined);
          }}
          kbId={adminMarkData.kbId}
          defaultValues={{
            dataId: adminMarkData.dataId,
            q: adminMarkData.q,
            a: adminMarkData.a
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
          const avatar = `<img src="${
            child.querySelector<HTMLImageElement>('.avatar')?.src
          }" alt="" />`;

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
