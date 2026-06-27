import React, { useEffect, useMemo, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { streamSkillDebugChat } from '@/web/core/skill/api';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import ChatAIModelSelector from '@/pageComponents/chat/ChatWindow/ChatAIModelSelector';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { useMemoizedFn } from 'ahooks';
import ProModal from '@/components/ProTip/ProModal';
import { useSkillDebugChatStore } from '../useSkillDebugChatStore';
import { getSkillEditChatSourceKey } from '@/web/core/chat/utils';
import { defaultQGConfig, defaultWhisperConfig } from '@fastgpt/global/core/app/constants';

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

const SkillPreview = () => {
  const { t } = useTranslation(['skill', 'common']);
  const { skillId, sandboxState, chatId } = useContextSelector(SkillDetailContext, (v) => ({
    skillId: v.skillId,
    sandboxState: v.sandboxState,
    chatId: v.chatId
  }));

  const { llmModelList, defaultModels, feConfigs } = useSystemStore();
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const defaultModel = defaultModels.llm?.model || llmModelList[0]?.model || '';
  const [proModalOpen, setProModalOpen] = useState(false);
  const selectedModel = useSkillDebugChatStore((state) => state.selectedModel);
  const setSelectedModel = useSkillDebugChatStore((state) => state.setSelectedModel);

  const modelSelectList = useMemo(
    () => llmModelList.map((item) => ({ label: item.name, value: item.model })),
    [llmModelList]
  );
  const fallbackModel = useMemo(() => {
    const modelSet = new Set(llmModelList.map((item) => item.model));
    if (selectedModel && modelSet.has(selectedModel)) return selectedModel;
    if (defaultModel && modelSet.has(defaultModel)) return defaultModel;
    return llmModelList[0]?.model || '';
  }, [defaultModel, llmModelList, selectedModel]);

  const isReady = sandboxState === 'ready';

  useEffect(() => {
    setChatBoxData((prev) => {
      const sourceKey = getSkillEditChatSourceKey(skillId);
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
              model: fallbackModel
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
  }, [skillId, chatId, fallbackModel, setChatBoxData]);

  const ModelSelectorInput = useMemo(() => {
    return (
      <ChatAIModelSelector
        h={'36px'}
        boxShadow={'none'}
        size={'sm'}
        bg={'myGray.50'}
        rounded={'10px'}
        value={fallbackModel}
        list={modelSelectList}
        onChange={setSelectedModel}
      />
    );
  }, [fallbackModel, modelSelectList, setSelectedModel]);

  const onStartChat = useMemoizedFn(
    async ({ messages, responseChatItemId, controller, generatingMessage }: StartChatFnProps) => {
      const histories = messages.slice(-1);

      const { responseText } = await streamSkillDebugChat({
        data: {
          skillId,
          chatId,
          messages: histories,
          model: fallbackModel,
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
          </Flex>
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
