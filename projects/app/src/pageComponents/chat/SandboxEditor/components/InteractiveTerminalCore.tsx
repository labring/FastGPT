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
  const { containerRef } = useInteractiveTerminal({
    appId,
    chatId,
    outLinkAuthData,
    canWrite
  });

  return (
    <Flex position={'relative'} w={'100%'} h={'100%'}>
      <Box ref={containerRef} w={'100%'} h={'100%'} bg={'#1e1e1e'} />
    </Flex>
  );
};

export default InteractiveTerminalCore;
