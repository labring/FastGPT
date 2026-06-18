import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import {
  delSkillDebugChatItem,
  getSkillDebugRecords,
  postStopSkillDebugChat,
  streamSkillDebugChat
} from '@/web/core/skill/api';
import type { LinkedPaginationProps } from '@fastgpt/global/openapi/api';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import ChatAIModelSelector from '@/pageComponents/chat/ChatWindow/ChatAIModelSelector';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';
import { useMemoizedFn } from 'ahooks';

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

  const { llmModelList, defaultModels } = useSystemStore();
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const defaultModel = defaultModels.llm?.model || llmModelList[0]?.model || '';
  const [selectedModel, setSelectedModel] = useState('');
  const userSelectedModelRef = useRef(false);

  const modelSelectList = useMemo(
    () => llmModelList.map((item) => ({ label: item.name, value: item.model })),
    [llmModelList]
  );

  const isReady = sandboxState === 'ready';

  useEffect(() => {
    setChatBoxData((prev) => {
      const isSameChat = prev.appId === skillId && prev.chatId === chatId;

      return {
        ...prev,
        appId: skillId,
        chatId,
        title: isSameChat ? prev.title : undefined,
        chatGenerateStatus: isSameChat ? prev.chatGenerateStatus : undefined,
        hasBeenRead: isSameChat ? prev.hasBeenRead : undefined,
        app: {
          chatConfig: { fileSelectConfig },
          name: 'Skill Preview',
          avatar: '',
          type: AppTypeEnum.simple,
          pluginInputs: []
        }
      };
    });
  }, [skillId, chatId, setChatBoxData]);

  useEffect(() => {
    if (!userSelectedModelRef.current && defaultModel && selectedModel !== defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel, selectedModel]);

  const ModelSelectorInput = useMemo(() => {
    return (
      <ChatAIModelSelector
        h={'36px'}
        boxShadow={'none'}
        size={'sm'}
        bg={'myGray.50'}
        rounded={'10px'}
        value={selectedModel}
        list={modelSelectList}
        onChange={(val) => {
          userSelectedModelRef.current = true;
          setSelectedModel(val);
        }}
      />
    );
  }, [selectedModel, modelSelectList]);

  const onStartChat = useMemoizedFn(
    async ({ messages, responseChatItemId, controller, generatingMessage }: StartChatFnProps) => {
      const histories = messages.slice(-1);

      const { responseText } = await streamSkillDebugChat({
        data: {
          skillId,
          chatId,
          messages: histories,
          model: selectedModel,
          responseChatItemId
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      return { responseText };
    }
  );

  // 使用 skill 专属的删除接口，避免走 /api/core/chat/item/delete 时用 skillId 查 App 报错
  const onDeleteChatItem = useMemoizedFn((contentId: string) =>
    delSkillDebugChatItem({ skillId, chatId, contentId })
  );
  const onStopChat = useMemoizedFn(async () => {
    const result = await postStopSkillDebugChat({ skillId, chatId });
    return {
      chatGenerateStatus: result.chatGenerateStatus,
      completed: result.completed
    };
  });

  return (
    <Box h={'100%'} w={'100%'} overflow={'hidden'}>
      <ChatBox
        isReady={isReady}
        appId={skillId}
        chatId={chatId}
        chatType={ChatTypeEnum.test}
        enableMarkChatRead={false}
        onStartChat={onStartChat}
        onDeleteChatItem={onDeleteChatItem}
        onStopChat={onStopChat}
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
            {t('empty_state_tip')}
          </Flex>
        }
      />
    </Box>
  );
};

const Render = () => {
  const { skillId, chatId } = useContextSelector(SkillDetailContext, (v) => ({
    skillId: v.skillId,
    chatId: v.chatId
  }));

  const chatRecordProviderParams = useMemo(
    () => ({
      appId: skillId,
      chatId
    }),
    [skillId, chatId]
  );

  const skillFetchFn = useCallback(
    (data: LinkedPaginationProps<GetPaginationRecordsBodyType>) =>
      getSkillDebugRecords({
        skillId,
        chatId: data.chatId!,
        pageSize: data.pageSize,
        initialId: data.initialId,
        nextId: data.nextId,
        prevId: data.prevId
      }),
    [skillId]
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
      showSandboxAction={false}
    >
      <ChatRecordContextProvider params={chatRecordProviderParams} fetchFn={skillFetchFn}>
        <SkillPreview />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
