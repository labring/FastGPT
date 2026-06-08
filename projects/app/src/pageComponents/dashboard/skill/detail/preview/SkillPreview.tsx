import React, { useCallback, useMemo, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatItemContextProvider from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useSkillChatTest } from './useSkillChatTest';
import { getSkillDebugRecords } from '@/web/core/skill/api';
import type { LinkedPaginationProps } from '@fastgpt/global/openapi/api';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import ChatAIModelSelector from '@/pageComponents/chat/ChatWindow/ChatAIModelSelector';

const SkillPreview = () => {
  const { skillId, sandboxState, chatId } = useContextSelector(SkillDetailContext, (v) => ({
    skillId: v.skillId,
    sandboxState: v.sandboxState,
    chatId: v.chatId
  }));

  const { llmModelList } = useSystemStore();
  const [selectedModel, setSelectedModel] = useState(llmModelList[0]?.model || '');

  const modelSelectList = useMemo(
    () => llmModelList.map((item) => ({ label: item.name, value: item.model })),
    [llmModelList]
  );

  const isReady = sandboxState === 'ready';

  const ModelSelectorInput = useMemo(() => {
    return (
      <ChatAIModelSelector
        value={selectedModel}
        list={modelSelectList}
        onChange={(val) => setSelectedModel(val)}
      />
    );
  }, [selectedModel, modelSelectList]);

  const { ChatContainer } = useSkillChatTest({
    skillId,
    model: selectedModel,
    chatId,
    isReady,
    InputLeftComponent: ModelSelectorInput
  });

  return (
    <Box h={'100%'} w={'100%'} overflow={'hidden'}>
      <ChatContainer />
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
    >
      <ChatRecordContextProvider params={chatRecordProviderParams} fetchFn={skillFetchFn}>
        <SkillPreview />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
