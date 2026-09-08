import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import ProModal from '@/components/ProTip/ProModal';
import ChatAIModelSelector from '@/pageComponents/chat/ChatWindow/ChatAIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useModelDefault } from '@/web/core/ai/model/useModelDefault';
import { getInitChatInfo } from '@/web/core/chat/api';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { getSkillEditChatSourceKey } from '@/web/core/chat/utils';
import { streamSkillDebugChat } from '@/web/core/skill/api';
import { Box } from '@chakra-ui/react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  AppTypeEnum,
  defaultQGConfig,
  defaultWhisperConfig
} from '@fastgpt/global/core/app/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMemoizedFn } from 'ahooks';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import { useSkillDebugChatStore } from '../useSkillDebugChatStore';

const fileSelectConfig: AppFileSelectConfigType = {
  maxFiles: 10,
  canSelectFile: true,
  canSelectImg: true,
  customPdfParse: false,
  canSelectVideo: true,
  canSelectAudio: true,
  canSelectCustomFileExtension: false,
  customFileExtensionList: []
};

const SkillPreview = () => {
  const { t } = useTranslation(['skill', 'common']);
  const { skillId, sandboxState, chatId } = useContextSelector(SkillDetailContext, (v) => ({
    skillId: v.skillId,
    sandboxState: v.sandboxState,
    chatId: v.chatId
  }));

  const { feConfigs } = useSystemStore();
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const [proModalOpen, setProModalOpen] = useState(false);
  const selectedModel = useSkillDebugChatStore((state) => state.selectedModel);
  const setSelectedModel = useSkillDebugChatStore((state) => state.setSelectedModel);

  const { model: defaultModel } = useModelDefault({
    modelType: ModelTypeEnum.llm,
    enabled: !!skillId && !!chatId && !selectedModel
  });
  useEffect(() => {
    // 父级尚未绑定当前 Skill 的调试会话时，不把默认值写到上一个 Skill 的偏好中。
    if (!skillId || !chatId) return;
    if (!selectedModel && defaultModel) setSelectedModel(defaultModel.modelId);
  }, [chatId, defaultModel, selectedModel, setSelectedModel, skillId]);

  const isReady = sandboxState === 'ready';
  const sourceKey = useMemo(() => getSkillEditChatSourceKey(skillId), [skillId]);

  useRequest(
    async () => {
      if (!skillId || !chatId) return;

      /*
        init 失败时仍先写入本地 preview 配置，保证调试页可以用默认态渲染。
        同一个 chat 内刷新模型配置时保留已有生成状态，避免把恢复条件提前清掉。
      */
      setChatBoxData((prev) => {
        const isSameChat = prev.sourceKey === sourceKey && prev.chatId === chatId;

        return {
          ...prev,
          sourceKey,
          appId: '',
          chatId,
          title: isSameChat ? prev.title : undefined,
          chatGenerateStatus: isSameChat ? prev.chatGenerateStatus : undefined,
          hasBeenRead: isSameChat ? prev.hasBeenRead : undefined,
          app: {
            chatConfig: {
              fileSelectConfig,
              questionGuide: {
                ...defaultQGConfig,
                open: true,
                modelId: selectedModel
              },
              whisperConfig: {
                ...defaultWhisperConfig,
                open: true
              }
            },
            name: 'Skill Preview',
            avatar: '',
            type: AppTypeEnum.simple,
            pluginInputs: []
          }
        };
      });

      const res = await getInitChatInfo({ skillId, chatId }).catch(() => undefined);
      if (!res) return;

      /*
        Skill Debug 的流恢复依赖刷新后重新拿到 chatGenerateStatus。
        这里只同步会话状态，调试页自己的模型和输入配置仍由本地 preview 配置控制。
      */
      setChatBoxData((prev) =>
        prev.sourceKey === sourceKey && prev.chatId === chatId
          ? {
              ...prev,
              sourceKey,
              appId: '',
              chatId: res.chatId || chatId,
              title: res.title,
              chatGenerateStatus: res.chatGenerateStatus,
              hasBeenRead: res.hasBeenRead
            }
          : prev
      );
    },
    {
      manual: false,
      refreshDeps: [skillId, chatId, sourceKey, selectedModel],
      errorToast: ''
    }
  );

  const ModelSelectorInput = useMemo(() => {
    return (
      <ChatAIModelSelector
        modelType={ModelTypeEnum.llm}
        h={'36px'}
        boxShadow={'none'}
        size={'sm'}
        bg={'myGray.50'}
        rounded={'10px'}
        value={selectedModel}
        onChange={setSelectedModel}
      />
    );
  }, [selectedModel, setSelectedModel]);

  const onStartChat = useMemoizedFn(
    async ({ messages, responseChatItemId, controller, generatingMessage }: StartChatFnProps) => {
      const histories = messages.slice(-1);

      const { responseText } = await streamSkillDebugChat({
        data: {
          skillId,
          chatId,
          messages: histories,
          modelId: selectedModel,
          responseChatItemId
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      return { responseText };
    }
  );

  return (
    <Box h={'100%'} w={'100%'} overflow={'hidden'}>
      <ChatBox
        isReady={isReady}
        sourceTarget={{ sourceType: ChatSourceTypeEnum.skillEdit, sourceId: skillId }}
        chatId={chatId}
        chatType={ChatTypeEnum.test}
        features={{
          markRead: false,
          voice: true,
          tts: false,
          inputGuide: true,
          autoResume: true,
          sandbox: false
        }}
        onStartChat={onStartChat}
        InputLeftComponent={ModelSelectorInput}
        disabledSendTip={isReady ? undefined : t('sandbox_lazy_init')}
        dialogTips={t('common:core.chat.Type a message')}
        pl={'16px'}
        pr={0}
        maxW={'100%'}
        boxBodyProps={{ px: 0, pr: '8px', maxW: '100%', mx: 0 }}
        inputBodyProps={{ maxW: '100%', mx: 0, px: 0, pl: 0, pr: '8px' }}
        EmptyState={
          <Box
            w="100%"
            color="myGray.500"
            fontSize="sm"
            textAlign="center"
            lineHeight="20px"
            whiteSpace="pre-wrap"
          >
            {feConfigs?.isPlus ? (
              t('empty_state_tip')
            ) : (
              <>
                {t('empty_state_community_prefix')}
                <Box
                  as="button"
                  type="button"
                  color="primary.600"
                  fontWeight={500}
                  cursor="pointer"
                  onClick={() => setProModalOpen(true)}
                >
                  {t('empty_state_community_upgrade')}
                </Box>
                {t('empty_state_community_suffix')}
              </>
            )}
          </Box>
        }
      />
      <ProModal isOpen={proModalOpen} onClose={() => setProModalOpen(false)} />
    </Box>
  );
};

const Render = () => {
  const { skillId, chatId } = useContextSelector(SkillDetailContext, (v) => ({
    skillId: v.skillId,
    chatId: v.chatId
  }));

  const chatRecordProviderParams = useMemo<GetPaginationRecordsBodyType>(
    () => ({
      skillId,
      chatId
    }),
    [skillId, chatId]
  );

  return (
    <ChatItemContextProvider
      showRouteToDatasetDetail={false}
      canDownloadSource={false}
      isShowCite={false}
      isShowFullText={false}
      showRunningStatus={true}
      showSkillReferences={true}
      showWholeResponse={false}
      showPoints={true}
      showAvatar={false}
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <SkillPreview />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
