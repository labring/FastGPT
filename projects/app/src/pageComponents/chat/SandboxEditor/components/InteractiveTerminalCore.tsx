import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useInteractiveTerminal } from './useInteractiveTerminal';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type { ChatTargetInputType } from '@fastgpt/global/openapi/core/chat/api';

import '@xterm/xterm/css/xterm.css';

type Props = {
  sandboxTarget: ChatTargetInputType;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  canWrite?: boolean;
};

const InteractiveTerminalCore = ({
  sandboxTarget,
  chatId,
  outLinkAuthData,
  canWrite = true
}: Props) => {
  const { containerRef } = useInteractiveTerminal({
    sandboxTarget,
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
