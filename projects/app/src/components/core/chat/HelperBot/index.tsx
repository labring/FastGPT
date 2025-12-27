import React, { useCallback, useImperativeHandle, useRef, useState } from 'react';

import HelperBotContextProvider, { type HelperBotProps } from './context';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/helperBot/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { Box } from '@chakra-ui/react';
import HumanItem from './components/HumanItem';
import AIItem from './components/AIItem';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { getHelperBotChatRecords } from './api';
import type {
  GetHelperBotChatRecordsParamsType,
  GetHelperBotChatRecordsResponseType
} from '@fastgpt/global/openapi/core/chat/helperBot/api';
import ChatInput from './Chatinput';
import type { ChatBoxInputFormType } from '../ChatContainer/ChatBox/type';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn, useThrottleFn } from 'ahooks';
import {
  HelperBotTypeEnum,
  type HelperBotChatItemSiteType
} from '@fastgpt/global/core/chat/helperBot/type';
import type { onSendMessageParamsType } from './type';
import { textareaMinH } from '../ChatContainer/ChatBox/constants';
import { streamFetch } from '@/web/common/api/fetch';
import type { generatingMessageProps } from '../ChatContainer/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const ChatBox = ({ type, metadata, onApply, ChatBoxRef, ...props }: HelperBotProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();

  const ScrollContainerRef = useRef<HTMLDivElement>(null);
  // Messages 管理
  const [chatId, setChatId] = useState<string>(getNanoid(12));
  const [isChatting, setIsChatting] = useState(false);

  const chatForm = useForm<ChatBoxInputFormType>({
    defaultValues: {
      input: '',
      files: [],
      chatStarted: false,
      variables: {}
    }
  });
  const { setValue } = chatForm;

  const requestParams = useMemoEnhance(() => {
    return {
      chatId,
      type
    };
  }, []);

  const scrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth', delay = 0) => {
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
  }, []);
  const {
    data: chatRecords,
    setData: setChatRecords,
    ScrollData
  } = useScrollPagination(
    async (
      data: GetHelperBotChatRecordsParamsType
    ): Promise<GetHelperBotChatRecordsResponseType> => {
      const res = await getHelperBotChatRecords(data);

      // First load scroll to bottom
      if (Number(data.offset) === 0) {
        scrollToBottom('auto');
      }

      return {
        ...res,
        list: res.list
      };
    },
    {
      pageSize: 10,
      refreshDeps: [requestParams],
      params: requestParams,
      scrollLoadType: 'top',
      showErrorToast: false
    }
  );

  const chatController = useRef(new AbortController());
  const abortRequest = useMemoizedFn((signal: string = 'stop') => {
    chatController.current?.abort(signal);
  });

  const resetInputVal = useMemoizedFn(({ query = '', files = [] }: onSendMessageParamsType) => {
    if (!TextareaDom.current) return;
    setValue('files', files);
    setValue('input', query);

    sessionStorage.removeItem(`chatInput_${chatId}`);

    setTimeout(() => {
      /* 回到最小高度 */
      if (TextareaDom.current) {
        TextareaDom.current.style.height =
          query === '' ? textareaMinH : `${TextareaDom.current.scrollHeight}px`;
      }
    }, 100);
  });

  // Text area
  const TextareaDom = useRef<HTMLTextAreaElement>(null);

  // Message request
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
    ({ event, text = '', reasoningText, collectionForm, formData }: generatingMessageProps) => {
      setChatRecords((state) =>
        state.map((item, index) => {
          if (index !== state.length - 1) return item;
          if (item.obj !== ChatRoleEnum.AI) return item;

          const updateIndex = item.value.length - 1;
          const updateValue: AIChatItemValueItemType = item.value[updateIndex];

          // Special event: form data
          if (event === SseResponseEventEnum.collectionForm && collectionForm) {
            return {
              ...item,
              value: item.value.concat({
                collectionForm
              })
            };
          }
          if (
            event === SseResponseEventEnum.topAgentConfig &&
            formData &&
            type === HelperBotTypeEnum.topAgent
          ) {
            onApply(formData);
            return item;
          }

          if (event === SseResponseEventEnum.answer || event === SseResponseEventEnum.fastAnswer) {
            if (reasoningText) {
              if ('reasoning' in updateValue && updateValue.reasoning) {
                updateValue.reasoning.content += reasoningText;
                return {
                  ...item,
                  value: [
                    ...item.value.slice(0, updateIndex),
                    updateValue,
                    ...item.value.slice(updateIndex + 1)
                  ]
                };
              } else {
                const val: AIChatItemValueItemType = {
                  reasoning: {
                    content: reasoningText
                  }
                };
                return {
                  ...item,
                  value: [...item.value, val]
                };
              }
            }
            if (text) {
              if ('text' in updateValue && updateValue.text) {
                updateValue.text.content += text;
                return {
                  ...item,
                  value: [
                    ...item.value.slice(0, updateIndex),
                    updateValue,
                    ...item.value.slice(updateIndex + 1)
                  ]
                };
              } else {
                const newValue: AIChatItemValueItemType = {
                  text: {
                    content: text
                  }
                };
                return {
                  ...item,
                  value: item.value.concat(newValue)
                };
              }
            }
          }

          return item;
        })
      );

      generatingScroll(false);
    }
  );
  const handleSendMessage = useMemoizedFn(
    async ({ query = '', collectionFormData }: onSendMessageParamsType) => {
      // Init check
      if (isChatting) {
        return toast({
          title: t('chat:is_chatting'),
          status: 'warning'
        });
      }

      abortRequest();
      query = query.trim();
      const mergeQuery = query || collectionFormData;

      if (!mergeQuery) {
        toast({
          title: t('chat:content_empty'),
          status: 'warning'
        });
        return;
      }

      const chatItemDataId = getNanoid(24);
      const newChatList: HelperBotChatItemSiteType[] = [
        ...chatRecords,
        // 用户消息
        {
          _id: getNanoid(24),
          createTime: new Date(),
          dataId: chatItemDataId,
          obj: ChatRoleEnum.Human,
          value: [
            {
              text: {
                content: mergeQuery
              }
            }
          ]
        },
        // AI 消息 - 空白,用于接收流式输出
        ...(query
          ? [
              {
                _id: getNanoid(24),
                createTime: new Date(),
                dataId: chatItemDataId,
                obj: ChatRoleEnum.AI,
                value: [
                  {
                    text: {
                      content: ''
                    }
                  }
                ]
              }
            ]
          : [])
      ];
      setChatRecords(newChatList);

      resetInputVal({});
      scrollToBottom();

      setIsChatting(true);
      try {
        const abortSignal = new AbortController();
        chatController.current = abortSignal;

        const { responseText } = await streamFetch({
          url: '/api/core/chat/helperBot/completions',
          data: {
            chatId,
            chatItemId: chatItemDataId,
            query: mergeQuery,
            files: chatForm.getValues('files').map((item) => ({
              type: item.type,
              key: item.key,
              // url: item.url,
              name: item.name
            })),
            metadata: {
              type: type,
              data: metadata
            }
          },
          onMessage: generatingMessage,
          abortCtrl: abortSignal
        });
      } catch (error) {}
      setIsChatting(false);
    }
  );

  useImperativeHandle(ChatBoxRef, () => ({
    restartChat() {
      abortRequest();
      setChatRecords([]);
      setChatId(getNanoid(12));
    }
  }));

  return (
    <MyBox display={'flex'} flexDirection={'column'} h={'100%'} position={'relative'}>
      <ScrollData
        ScrollContainerRef={ScrollContainerRef}
        flex={'1 0 0'}
        h={0}
        w={'100%'}
        overflow={'overlay'}
        px={[4, 0]}
        pb={3}
      >
        {chatRecords.map((item, index) => (
          <Box
            key={item._id}
            px={[3, 5]}
            w={'100%'}
            maxW={['auto', 'min(1000px, 100%)']}
            mx="auto"
            _notLast={{
              mb: 2
            }}
          >
            {item.obj === ChatRoleEnum.Human && <HumanItem chat={item} />}
            {item.obj === ChatRoleEnum.AI && (
              <AIItem
                chat={item}
                isChatting={isChatting}
                isLastChild={index === chatRecords.length - 1}
                onSubmitCollectionForm={(data) => handleSendMessage({ query: data })}
              />
            )}
          </Box>
        ))}
      </ScrollData>
      <Box
        px={[3, 5]}
        m={['0 auto 10px', '10px auto']}
        w={'100%'}
        maxW={['auto', 'min(820px, 100%)']}
      >
        <ChatInput
          TextareaDom={TextareaDom}
          chatId={chatId}
          chatForm={chatForm}
          isChatting={isChatting}
          onSendMessage={handleSendMessage}
          onStop={() => {}}
        />
      </Box>
    </MyBox>
  );
};

const index = (props: HelperBotProps) => {
  return (
    <HelperBotContextProvider {...props}>
      <ChatBox {...props} />
    </HelperBotContextProvider>
  );
};

export default index;
