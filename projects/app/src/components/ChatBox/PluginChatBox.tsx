import { useCallback, useEffect, useMemo, useRef } from 'react';
import PluginBox from './components/PluginBox';
import { ChatTypeEnum } from './constants';
import { Box } from '@chakra-ui/react';
import { useForm, UseFormHandleSubmit } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from './Provider';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  ChatBoxInputFormType,
  ChatBoxInputType,
  generatingMessageProps,
  StartChatFnProps
} from './type';
import { ChatSiteItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { StreamResponseType } from '@/web/common/api/fetch';
import { useTranslation } from 'react-i18next';

const PluginChatBox = ({
  chatType,
  pluginInputs,
  onStartChat,
  handleSubmit,
  generatingMessage
}: {
  chatType: `${ChatTypeEnum}`;
  pluginInputs: FlowNodeInputItemType[];
  onStartChat?: (e: StartChatFnProps) => Promise<
    StreamResponseType & {
      isNewChat?: boolean;
    }
  >;
  handleSubmit: UseFormHandleSubmit<ChatBoxInputFormType>;
  generatingMessage: ({
    event,
    text,
    status,
    name,
    tool,
    autoTTSResponse,
    variables
  }: generatingMessageProps & {
    autoTTSResponse?: boolean;
  }) => void;
}) => {
  const {
    variableList,
    startSegmentedAudio,
    finishSegmentedAudio,
    setAudioPlayingChatId,
    splitText2Audio,
    chatHistories,
    setChatHistories,
    isChatting
  } = useContextSelector(ChatBoxContext, (v) => v);
  const pluginForm = useForm();
  const { handleSubmit: handlePluginSubmit, control: pluginControl, reset } = pluginForm;

  const ChatBoxRef = useRef<HTMLDivElement>(null);
  const chatController = useRef(new AbortController());
  const { toast } = useToast();
  const { t } = useTranslation();

  const currentPluginInputs = useMemo(() => {
    return chatHistories.length > 0
      ? JSON.parse(chatHistories[0]?.value[0].text?.content || '{}').format
      : pluginInputs;
  }, [chatHistories, pluginInputs]);

  useEffect(() => {
    function convertArrayToJson(arr: FlowNodeInputItemType[]) {
      let result: Record<string, any> = {};
      arr?.forEach((item) => {
        result[item.key] = item.defaultValue || '';
      });
      return result;
    }

    const pluginVariables = convertArrayToJson(currentPluginInputs);
    reset({
      ...pluginVariables,
      ...JSON.parse(chatHistories[0]?.value[0].text?.content || '{}').value
    });
  }, [chatHistories]);

  const sendPrompt = useCallback(
    ({
      text = '',
      pluginVariables
    }: ChatBoxInputType & {
      autoTTSResponse?: boolean;
      pluginVariables?: any;
    }) => {
      handleSubmit(
        async ({ variables }) => {
          if (!onStartChat) return;
          if (isChatting) {
            toast({
              title: '正在聊天中...请等待结束',
              status: 'warning'
            });
            return;
          }

          text = text.trim();

          // delete invalid variables， 只保留在 variableList 中的变量
          const requestVariables: Record<string, any> = {};
          variableList?.forEach((item) => {
            requestVariables[item.key] = variables[item.key] || '';
          });

          const responseChatId = getNanoid(24);

          const newChatList: ChatSiteItemType[] = [
            {
              dataId: getNanoid(24),
              obj: ChatRoleEnum.Human,
              value: [
                {
                  type: ChatItemValueTypeEnum.text,
                  text: {
                    content: JSON.stringify({
                      value: pluginVariables,
                      format: pluginInputs
                    })
                  }
                }
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

          try {
            // create abort obj
            const abortSignal = new AbortController();
            chatController.current = abortSignal;

            const messages = chats2GPTMessages({ messages: newChatList, reserveId: true });

            const { responseData } = await onStartChat({
              chatList: newChatList,
              messages,
              controller: abortSignal,
              generatingMessage: (e) => generatingMessage({ ...e }),
              variables: pluginVariables
            });

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
          } catch (err: any) {
            toast({
              title: t(getErrText(err, 'core.chat.error.Chat error')),
              status: 'error',
              duration: 5000,
              isClosable: true
            });

            if (!err?.responseText) {
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
        },
        (err) => {
          console.log(err?.variables);
        }
      )();
    },
    [
      chatHistories,
      finishSegmentedAudio,
      isChatting,
      pluginInputs,
      setAudioPlayingChatId,
      setChatHistories,
      splitText2Audio,
      startSegmentedAudio,
      variableList
    ]
  );

  return (
    <Box ref={ChatBoxRef} flex={'1 0 0'} h={0} w={'100%'} overflow={'overlay'} px={[4, 0]} pb={3}>
      <PluginBox
        chatType={chatType}
        pluginInputs={currentPluginInputs}
        control={pluginControl}
        handleSubmit={handlePluginSubmit}
        sendPrompt={sendPrompt}
        chatHistories={chatHistories}
        isChatting={isChatting}
        onStartChat={onStartChat}
      />
    </Box>
  );
};

export default PluginChatBox;
