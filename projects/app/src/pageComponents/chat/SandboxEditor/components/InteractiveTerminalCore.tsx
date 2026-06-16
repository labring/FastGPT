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
    <Flex position={'relative'} w={'100%'} h={'100%'} bg={'#ffffff'} px={'16px'}>
      <Box ref={containerRef} w={'100%'} h={'100%'} bg={'#ffffff'} />
    </Flex>
  );
};

export default InteractiveTerminalCore;
