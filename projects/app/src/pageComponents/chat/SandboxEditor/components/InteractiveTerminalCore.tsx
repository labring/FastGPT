import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useInteractiveTerminal } from './useInteractiveTerminal';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

import '@xterm/xterm/css/xterm.css';

type Props = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  canWrite?: boolean;
};

const InteractiveTerminalCore = ({ appId, chatId, outLinkAuthData, canWrite = true }: Props) => {
  // 1. 挂载逻辑自适应终端 Hook
  const { containerRef } = useInteractiveTerminal({
    appId,
    chatId,
    outLinkAuthData,
    canWrite
  });

  return (
    <Flex flexDirection="column" h="100%" bg="white" borderTop="none" borderColor="transparent">
      {/* Xterm 挂载容器 */}
      <Box flex={1} ref={containerRef} overflow="hidden" p={2} position="relative" bg="white" />
    </Flex>
  );
};

export default React.memo(InteractiveTerminalCore);
