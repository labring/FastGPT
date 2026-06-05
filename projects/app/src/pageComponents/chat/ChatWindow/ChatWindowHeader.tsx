import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import MarkdownExportButton from '@/pageComponents/chat/MarkdownExportButton';
import ChatVariableButton from './ChatVariableButton';
import type { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';

const ChatWindowHeader = ({
  title,
  history,
  chatType
}: {
  title?: string;
  history: ChatItemMiniType[];
  chatType: ChatTypeEnum;
}) => {
  const hasHistory = history.length > 0;

  return (
    <Flex
      minH="56px"
      px={5}
      bg="white"
      fontWeight={500}
      color="myGray.900"
      alignItems="center"
      justifyContent="center"
      position="relative"
    >
      {title}
      <Flex position="absolute" right={5} alignItems="center" gap={2}>
        <ChatVariableButton chatType={chatType} />
        {hasHistory && <MarkdownExportButton history={history} />}
      </Flex>
    </Flex>
  );
};

export default React.memo(ChatWindowHeader);
