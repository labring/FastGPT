import React, {
  useCallback,
  useRef,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
  ForwardedRef
} from 'react';
import { throttle } from 'lodash';
import { ChatItemType, ChatSiteItemType, ExportChatType } from '@/types/chat';
import { useToast } from '@/hooks/useToast';
import { useCopyData, voiceBroadcast, hasVoiceApi, getErrText } from '@/utils/tools';
import { Box, Card, Flex, Input, Textarea, Button, useTheme } from '@chakra-ui/react';
import { useUserStore } from '@/store/user';

import { Types } from 'mongoose';
import { HUMAN_ICON, quoteLenKey, rawSearchKey } from '@/constants/chat';
import Markdown from '@/components/Markdown';
import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';

import { adaptChatItem_openAI } from '@/utils/plugin/openai';
import { VariableItemType } from '@/types/app';
import { VariableInputEnum } from '@/constants/app';
import { useForm } from 'react-hook-form';
import MySelect from '@/components/Select';
import { MessageItemType } from '@/pages/api/openapi/v1/chat/completions';
import MyTooltip from '../MyTooltip';
import { fileDownload } from '@/utils/file';
import { htmlTemplate } from '@/constants/common';
import dynamic from 'next/dynamic';

const QuoteModal = dynamic(() => import('./QuoteModal'));

import styles from './index.module.scss';
import { QuoteItemType } from '@/pages/api/app/modules/kb/search';

const textareaMinH = '22px';
export type StartChatFnProps = {
  messages: MessageItemType[];
  controller: AbortController;
  variables: Record<string, any>;
  generatingMessage: (text: string) => void;
};

export type ComponentRef = {
  getChatHistory: () => ChatSiteItemType[];
  resetVariables: (data?: Record<string, any>) => void;
  resetHistory: (history: ChatSiteItemType[]) => void;
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
};

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

const ChatBox = (
  {
    historyId,
    appAvatar,
    variableModules,
    welcomeText,
    onUpdateVariable,
    onStartChat,
    onDelMessage
  }: {
    historyId?: string;
    appAvatar: string;
    variableModules?: VariableItemType[];
    welcomeText?: string;
    onUpdateVariable?: (e: Record<string, any>) => void;
    onStartChat: (
      e: StartChatFnProps
    ) => Promise<{ responseText?: string; rawSearch?: QuoteItemType[] }>;
    onDelMessage?: (e: { contentId?: string; index: number }) => void;
  },
  ref: ForwardedRef<ComponentRef>
) => {
  const ChatBoxRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const { copyData } = useCopyData();
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const TextareaDom = useRef<HTMLTextAreaElement>(null);
  const controller = useRef(new AbortController());

  const [refresh, setRefresh] = useState(false);
  const [variables, setVariables] = useState<Record<string, any>>({});
  const [chatHistory, setChatHistory] = useState<ChatSiteItemType[]>([]);
  const [quoteModalData, setQuoteModalData] = useState<{
    contentId?: string;
    rawSearch?: QuoteItemType[];
  }>();

  const isChatting = useMemo(
    () => chatHistory[chatHistory.length - 1]?.status === 'loading',
    [chatHistory]
  );
  const variableIsFinish = useMemo(() => {
    if (!variableModules || chatHistory.length > 0) return true;

    for (let i = 0; i < variableModules.length; i++) {
      const item = variableModules[i];
      if (item.required && !variables[item.key]) {
        return false;
      }
    }

    return true;
  }, [chatHistory.length, variableModules, variables]);

  const isLargeWidth = ChatBoxRef?.current?.clientWidth && ChatBoxRef?.current?.clientWidth >= 900;

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
    (text: string) => {
      setChatHistory((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1) return item;
          return {
            ...item,
            value: item.value + text
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
      const val = value.replace(/\n+/g, '\n');
      copyData(val);
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
    async (data: Record<string, any> = {}) => {
      if (isChatting) {
        toast({
          title: '正在聊天中...请等待结束',
          status: 'warning'
        });
        return;
      }
      // get input value
      const value = TextareaDom.current?.value || '';
      const val = value.trim().replace(/\n\s*/g, '\n');

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
          _id: String(new Types.ObjectId()),
          obj: 'Human',
          value: val,
          status: 'finish'
        },
        {
          _id: String(new Types.ObjectId()),
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

        const { rawSearch } = await onStartChat({
          messages,
          controller: abortSignal,
          generatingMessage,
          variables: data
        });

        // set finish status
        setChatHistory((state) =>
          state.map((item, index) => {
            if (index !== state.length - 1) return item;
            return {
              ...item,
              status: 'finish',
              rawSearch
            };
          })
        );

        setTimeout(() => {
          generatingScroll();
          TextareaDom.current?.focus();
        }, 100);
      } catch (err: any) {
        toast({
          title: getErrText(err, '聊天出错了~'),
          status: 'error',
          duration: 5000,
          isClosable: true
        });

        if (!err?.responseText) {
          resetInputVal(value);
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
      setChatHistory,
      resetInputVal,
      toast,
      scrollToBottom,
      onStartChat,
      generatingMessage,
      generatingScroll
    ]
  );

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
  const controlContainerStyle = {
    className: 'control',
    color: 'myGray.400',
    display: ['flex', 'none'],
    pl: 1,
    mt: 2,
    position: 'absolute' as any,
    zIndex: 1,
    w: '100%'
  };

  const hasVariableInput = useMemo(
    () => variableModules || welcomeText,
    [variableModules, welcomeText]
  );

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Box ref={ChatBoxRef} flex={'1 0 0'} h={0} overflow={'overlay'} px={[2, 5, 8]} py={[0, 5]}>
        <Box maxW={['100%', '1000px', '1200px']} h={'100%'} mx={'auto'}>
          {/* variable input */}
          {hasVariableInput && (
            <Flex alignItems={'flex-start'} py={2}>
              {/* avatar */}
              <Avatar
                src={appAvatar}
                w={['24px', '34px']}
                h={['24px', '34px']}
                order={1}
                mr={['6px', 2]}
              />
              {/* message */}
              <Flex order={2} pt={2} maxW={`calc(100% - ${isLargeWidth ? '75px' : '58px'})`}>
                <Card bg={'white'} px={4} py={3} borderRadius={'0 8px 8px 8px'}>
                  {welcomeText && (
                    <Box mb={2} pb={2} borderBottom={theme.borders.base}>
                      {welcomeText}
                    </Box>
                  )}
                  {variableModules && (
                    <Box>
                      {variableModules.map((item) => (
                        <Box w={'min(100%,300px)'} key={item.id} mb={4}>
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
                          })}
                        >
                          {'开始对话'}
                        </Button>
                      )}
                    </Box>
                  )}
                </Card>
              </Flex>
            </Flex>
          )}

          {/* chat history */}
          <Box id={'history'} pb={[8, 2]}>
            {chatHistory.map((item, index) => (
              <Flex
                key={item._id}
                alignItems={'flex-start'}
                py={4}
                _hover={{
                  '& .control': {
                    display: item.status === 'finish' ? 'flex' : 'none'
                  }
                }}
              >
                {item.obj === 'Human' && <Box flex={1} />}
                {/* avatar */}
                <Avatar
                  src={item.obj === 'Human' ? userInfo?.avatar || HUMAN_ICON : appAvatar}
                  w={['24px', '34px']}
                  h={['24px', '34px']}
                  {...(item.obj === 'AI'
                    ? {
                        order: 1,
                        mr: ['6px', 2]
                      }
                    : {
                        order: 3,
                        ml: ['6px', 2]
                      })}
                />
                {/* message */}
                <Box order={2} pt={2} maxW={`calc(100% - ${isLargeWidth ? '75px' : '58px'})`}>
                  {item.obj === 'AI' ? (
                    <Box w={'100%'} position={'relative'}>
                      <Card bg={'white'} px={4} py={3} borderRadius={'0 8px 8px 8px'}>
                        <Markdown
                          source={item.value}
                          isChatting={index === chatHistory.length - 1 && isChatting}
                        />
                        {(item[quoteLenKey] || item[rawSearchKey]?.length) && (
                          <Button
                            size={'xs'}
                            variant={'base'}
                            mt={2}
                            w={'80px'}
                            onClick={() => {
                              setQuoteModalData({
                                contentId: item._id,
                                rawSearch: item[rawSearchKey]
                              });
                            }}
                          >
                            {item[quoteLenKey] || item[rawSearchKey]?.length}条引用
                          </Button>
                        )}
                      </Card>

                      <Flex {...controlContainerStyle}>
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
                                  state.filter((chat) => chat._id !== item._id)
                                );
                                onDelMessage({
                                  contentId: item._id,
                                  index
                                });
                              }}
                            />
                          </MyTooltip>
                        )}
                        {hasVoiceApi && (
                          <MyTooltip label={'语音播报'}>
                            <MyIcon
                              {...controlIconStyle}
                              name={'voice'}
                              _hover={{ color: '#E74694' }}
                              onClick={() => voiceBroadcast({ text: item.value })}
                            />
                          </MyTooltip>
                        )}
                      </Flex>
                    </Box>
                  ) : (
                    <Box position={'relative'}>
                      <Card
                        className="markdown"
                        whiteSpace={'pre-wrap'}
                        px={4}
                        py={3}
                        borderRadius={'8px 0 8px 8px'}
                        bg={'myBlue.300'}
                      >
                        <Box as={'p'}>{item.value}</Box>
                      </Card>
                      <Flex {...controlContainerStyle} justifyContent={'flex-end'}>
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
                                  state.filter((chat) => chat._id !== item._id)
                                );
                                onDelMessage({
                                  contentId: item._id,
                                  index
                                });
                              }}
                            />
                          </MyTooltip>
                        )}
                      </Flex>
                    </Box>
                  )}
                </Box>
              </Flex>
            ))}
          </Box>
        </Box>
      </Box>
      {/* input */}
      {variableIsFinish ? (
        <Box m={['0 auto', '20px auto']} w={'100%'} maxW={['auto', 'min(750px, 100%)']} px={[0, 5]}>
          <Box
            py={'18px'}
            position={'relative'}
            boxShadow={`0 0 10px rgba(0,0,0,0.1)`}
            borderTop={['1px solid', 0]}
            borderTopColor={'gray.200'}
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
                if (e.keyCode === 13 && !e.shiftKey) {
                  handleSubmit(sendPrompt)();
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
                  onClick={() => controller.current?.abort()}
                />
              ) : (
                <MyIcon
                  name={'chatSend'}
                  width={['18px', '20px']}
                  height={['18px', '20px']}
                  cursor={'pointer'}
                  color={'gray.500'}
                  onClick={handleSubmit(sendPrompt)}
                />
              )}
            </Flex>
          </Box>
        </Box>
      ) : null}
      {/* quote modal */}
      {!!quoteModalData && (
        <QuoteModal
          historyId={historyId}
          {...quoteModalData}
          onClose={() => setQuoteModalData(undefined)}
        />
      )}
      {/* quote modal */}
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
