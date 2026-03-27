import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatItemContextProvider from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useSkillChatTest } from './useSkillChatTest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSkillDebugRecords } from '@/web/core/skill/api';
import type { LinkedPaginationProps } from '@fastgpt/web/common/fetch/type';
import type { GetChatRecordsProps } from '@/global/core/chat/api';

const SkillPreview = ({ chatId, restartChat }: { chatId: string; restartChat: () => void }) => {
  const { t } = useTranslation();
  const { skillId, sandboxState } = useContextSelector(SkillDetailContext, (v) => v);

  const { llmModelList } = useSystemStore();
  const [selectedModel, setSelectedModel] = useState(llmModelList[0]?.model || '');

  const modelSelectList = useMemo(
    () => llmModelList.map((item) => ({ label: item.name, value: item.model })),
    [llmModelList]
  );

  const isReady = sandboxState === 'ready';

  const { ChatContainer } = useSkillChatTest({
    skillId,
    model: selectedModel,
    chatId,
    isReady
  });

  return (
    <Flex h={'100%'} direction={'column'} py={'16px'} px={'24px'}>
      {/* Header */}
      <Flex alignItems={'center'} justifyContent={'space-between'} mb={4} flexShrink={0}>
        <Box fontSize={'18px'} fontWeight={500} color={'#111824'} lineHeight={'28px'}>
          {t('skill:detail_tab_preview')}
        </Box>
        <Flex alignItems={'center'} gap={'8px'}>
          <AIModelSelector
            w={'200px'}
            size={'sm'}
            value={selectedModel}
            list={modelSelectList}
            onChange={(val) => setSelectedModel(val)}
          />
          <IconButton
            w={'32px'}
            h={'32px'}
            minW={'32px'}
            icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
            variant={'whiteDanger'}
            borderRadius={'md'}
            aria-label={'clear'}
            onClick={(e) => {
              e.stopPropagation();
              restartChat();
            }}
          />
        </Flex>
      </Flex>

      {/* Chat area */}
      <Box flex={1} overflow={'hidden'}>
        <ChatContainer />
      </Box>
    </Flex>
  );
};

const CHAT_ID_STORAGE_KEY = (skillId: string) => `skill_debug_chatId_${skillId}`;

const Render = () => {
  const { skillId } = useContextSelector(SkillDetailContext, (v) => v);
  const [chatId, setChatId] = useState(() => {
    const stored = localStorage.getItem(CHAT_ID_STORAGE_KEY(skillId));
    if (stored) return stored;
    const newId = getNanoid(24);
    localStorage.setItem(CHAT_ID_STORAGE_KEY(skillId), newId);
    return newId;
  });

  const chatRecordProviderParams = useMemo(
    () => ({
      appId: skillId,
      chatId
    }),
    [skillId, chatId]
  );

  const restartChat = useCallback(() => {
    const newId = getNanoid(24);
    localStorage.setItem(CHAT_ID_STORAGE_KEY(skillId), newId);
    setChatId(newId);
  }, [skillId]);

  const skillFetchFn = useCallback(
    (data: LinkedPaginationProps<GetChatRecordsProps>) =>
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
      showAvatar={false}
    >
      <ChatRecordContextProvider params={chatRecordProviderParams} fetchFn={skillFetchFn}>
        <SkillPreview chatId={chatId} restartChat={restartChat} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
