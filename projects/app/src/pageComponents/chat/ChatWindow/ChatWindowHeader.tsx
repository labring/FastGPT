import React, { useRef } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useSize } from 'ahooks';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MarkdownExportButton from '@/pageComponents/chat/MarkdownExportButton';
import ChatVariableButton from './ChatVariableButton';
import type { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';

/** 聊天页头；标题相对整个会话区居中，两侧对称预留操作区宽度，避免入口展开时偏移或重叠。 */
const ChatWindowHeader = ({
  title,
  history,
  chatType,
  rightActions,
  endActions
}: {
  title?: string;
  history: ChatItemMiniType[];
  chatType: ChatTypeEnum;
  rightActions?: React.ReactNode;
  endActions?: React.ReactNode;
}) => {
  const hasHistory = history.length > 0;
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsSize = useSize(actionsRef);

  return (
    <Flex
      as="header"
      position="relative"
      minH="56px"
      px={5}
      bg="white"
      fontWeight={500}
      color="myGray.900"
      alignItems="center"
      gap={2}
    >
      <Box
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        w={`max(0px, calc(100% - ${2 * (20 + (actionsSize?.width ?? 0) + 8)}px))`}
        minW={0}
        textAlign="center"
      >
        <MyTooltip label={title} showOnlyWhenOverflow>
          <Box isTruncated>{title}</Box>
        </MyTooltip>
      </Box>
      <Flex ref={actionsRef} ml="auto" flexShrink={0} alignItems="center" gap={2}>
        {rightActions}
        <ChatVariableButton chatType={chatType} />
        {hasHistory && <MarkdownExportButton history={history} />}
        {endActions}
      </Flex>
    </Flex>
  );
};

export default React.memo(ChatWindowHeader);
