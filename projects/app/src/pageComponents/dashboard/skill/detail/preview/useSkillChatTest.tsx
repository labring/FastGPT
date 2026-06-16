import { useCallback, useEffect } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { streamFetch } from '@/web/common/api/fetch';
import {
  SKILL_DEBUG_CHAT_URL,
  delSkillDebugChatItem,
  postStopSkillDebugChat
} from '@/web/core/skill/api';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import React from 'react';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const fileSelectConfig: AppFileSelectConfigType = {
  maxFiles: 10,
  canSelectFile: false,
  canSelectImg: false,
  customPdfParse: false,
  canSelectVideo: false,
  canSelectAudio: false,
  canSelectCustomFileExtension: false,
  customFileExtensionList: []
};

export const useSkillChatTest = ({
  skillId,
  model,
  chatId,
  isReady,
  disabledSendTip,
  InputLeftComponent
}: {
  skillId: string;
  model: string;
  chatId: string;
  isReady: boolean;
  disabledSendTip?: string;
  InputLeftComponent?: React.ReactNode;
}) => {
  const { t } = useTranslation(['skill', 'common']);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);

  // Set chat box data
  useEffect(() => {
    setChatBoxData({
      appId: skillId,
      app: {
        chatConfig: { fileSelectConfig },
        name: 'Skill Preview',
        avatar: '',
        type: AppTypeEnum.simple,
        pluginInputs: []
      }
    });
  }, [skillId, setChatBoxData]);

  const startChat = useMemoizedFn(
    async ({ messages, responseChatItemId, controller, generatingMessage }: StartChatFnProps) => {
      const histories = messages.slice(-1);

      const { responseText } = await streamFetch({
        url: SKILL_DEBUG_CHAT_URL,
        data: {
          skillId,
          chatId,
          messages: histories,
          model,
          responseChatItemId
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      return { responseText };
    }
  );

  // 使用 skill 专属的删除接口，避免走 /api/core/chat/item/delete 时用 skillId 查 App 报错
  const handleDeleteChatItem = useMemoizedFn((contentId: string) =>
    delSkillDebugChatItem({ skillId, chatId, contentId })
  );
  const handleStopChat = useMemoizedFn(async () => {
    const result = await postStopSkillDebugChat({ skillId, chatId });
    return {
      chatGenerateStatus: result.chatGenerateStatus,
      completed: result.completed
    };
  });

  const ChatContainer = useCallback(
    () => (
      <ChatBox
        isReady={isReady}
        appId={skillId}
        chatId={chatId}
        chatType={ChatTypeEnum.test}
        enableMarkChatRead={false}
        onStartChat={startChat}
        onDeleteChatItem={handleDeleteChatItem}
        onStopChat={handleStopChat}
        InputLeftComponent={InputLeftComponent}
        disabledSendTip={disabledSendTip ? t(disabledSendTip as any) : undefined}
        dialogTips={t('common:core.chat.Type a message')}
        pl={'16px'}
        pr={0}
        maxW={'100%'}
        boxBodyProps={{ px: 0, maxW: '100%', mx: 0 }}
        inputBodyProps={{ maxW: '100%', mx: 0, px: 0, pl: 0, pr: 0 }}
        EmptyState={
          <Flex
            flex={1}
            alignItems="center"
            justifyContent="center"
            color="myGray.500"
            fontSize="sm"
            textAlign="center"
            lineHeight="20px"
            whiteSpace="pre-wrap"
          >
            {t('empty_state_tip')}
          </Flex>
        }
      />
    ),
    [
      skillId,
      chatId,
      isReady,
      startChat,
      handleDeleteChatItem,
      handleStopChat,
      InputLeftComponent,
      disabledSendTip,
      t
    ]
  );

  return {
    ChatContainer
  };
};
