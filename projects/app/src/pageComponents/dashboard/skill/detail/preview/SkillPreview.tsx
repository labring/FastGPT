import React, { useCallback, useMemo, useState } from 'react';
import { Box, Menu, MenuButton, MenuList, MenuItem, Button } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ChatItemContextProvider from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useSkillChatTest } from './useSkillChatTest';
import { getSkillDebugRecords } from '@/web/core/skill/api';
import type { LinkedPaginationProps } from '@fastgpt/global/openapi/api';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';

const ModelSelector = ({
  value,
  list,
  onChange
}: {
  value: string;
  list: { label: string; value: string }[];
  onChange: (val: string) => void;
}) => {
  const currentLabel = list.find((item) => item.value === value)?.label || value;

  return (
    <Menu>
      <MenuButton
        as={Button}
        size="sm"
        h="36px"
        bg="myGray.50"
        border="0.5px solid"
        borderColor="myGray.250"
        borderRadius="semilg"
        px={3}
        fontWeight="medium"
        color="myGray.600"
        fontSize="14px"
        rightIcon={<MyIcon name="core/chat/chevronDown" w="18px" color="myGray.600" />}
        _hover={{ bg: '#f1f2f4' }}
        _active={{ bg: '#eef0f2' }}
      >
        {currentLabel}
      </MenuButton>
      <MenuList minW="200px" zIndex={99}>
        {list.map((item) => (
          <MenuItem
            key={item.value}
            onClick={() => onChange(item.value)}
            fontSize="sm"
            color="myGray.800"
            bg={item.value === value ? 'myGray.100' : 'transparent'}
          >
            {item.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

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
      <ModelSelector
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
      showAvatar={false}
    >
      <ChatRecordContextProvider params={chatRecordProviderParams} fetchFn={skillFetchFn}>
        <SkillPreview />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
