import { useCallback, useEffect } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { streamFetch } from '@/web/common/api/fetch';
import { SKILL_DEBUG_CHAT_URL, delSkillDebugChatItem } from '@/web/core/skill/api';
import { syncSkillSandbox } from '@/pageComponents/dashboard/skill/detail/config/AgentSkillEditor/api';
import { SkillDetailContext } from '../context';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import React from 'react';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';

export const useSkillChatTest = ({
  skillId,
  model,
  chatId,
  isReady = true
}: {
  skillId: string;
  model: string;
  chatId: string;
  // session-runtime sandbox 懒初始化，首次发消息触发 warm-up；调用方一般不再需要传
  isReady?: boolean;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const flushAllPendingRef = useContextSelector(SkillDetailContext, (v) => v.flushAllPendingRef);

  // TODO: 暂时隐藏文件上传按钮，后续需要放开 canSelectFile 和 canSelectImg
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId, setChatBoxData]);

  const startChat = useMemoizedFn(
    async ({ messages, responseChatItemId, controller, generatingMessage }: StartChatFnProps) => {
      // Flush pending editor auto-saves so the sandbox sync picks up the latest content.
      await flushAllPendingRef.current?.();

      try {
        await syncSkillSandbox({ skillId });
      } catch (err) {
        toast({
          status: 'warning',
          title: t('skill:preview_sync_failed_title'),
          description: getErrText(err)
        });
      }

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

  const ChatContainer = useCallback(
    () => (
      <ChatBox
        isReady={isReady}
        appId={skillId}
        chatId={chatId}
        chatType={ChatTypeEnum.test}
        onStartChat={startChat}
        onDeleteChatItem={handleDeleteChatItem}
      />
    ),
    [skillId, chatId, isReady, startChat, handleDeleteChatItem]
  );

  return {
    ChatContainer
  };
};
