import { useCallback, useEffect } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { streamFetch } from '@/web/common/api/fetch';
import { SKILL_DEBUG_CHAT_URL } from '@/web/core/skill/api';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import React from 'react';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';

export const useSkillChatTest = ({
  skillId,
  model,
  chatId,
  isReady
}: {
  skillId: string;
  model: string;
  chatId: string;
  isReady: boolean;
}) => {
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);

  // Set chat box data
  useEffect(() => {
    setChatBoxData({
      appId: skillId,
      app: {
        chatConfig: {},
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

  const ChatContainer = useCallback(
    () => (
      <ChatBox
        isReady={isReady}
        appId={skillId}
        chatId={chatId}
        chatType={ChatTypeEnum.test}
        onStartChat={startChat}
      />
    ),
    [skillId, chatId, isReady, startChat]
  );

  return {
    ChatContainer
  };
};
