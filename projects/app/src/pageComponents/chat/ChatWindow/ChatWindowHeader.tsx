import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import MarkdownExportButton from '@/pageComponents/chat/MarkdownExportButton';

const ChatWindowHeader = ({
  title,
  history
}: {
  title?: string;
  history: ChatItemMiniType[];
}) => {
  const hasHistory = history.length > 0;

  return (
    <Flex
      minH="60px"
      px={5}
      bg="white"
      fontWeight={500}
      color="myGray.900"
      alignItems="center"
      justifyContent="center"
      position="relative"
    >
      {title}
      {hasHistory && (
        <Box position="absolute" right={5}>
          <MarkdownExportButton history={history} />
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(ChatWindowHeader);
