import React from 'react';
import { Box, Flex, IconButton, Tooltip } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useInteractiveTerminal } from './useInteractiveTerminal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

import 'xterm/css/xterm.css';

type Props = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  onClose?: () => void;
};

const InteractiveTerminalCore = ({ appId, chatId, outLinkAuthData, onClose }: Props) => {
  const { t } = useTranslation();

  // 1. 挂载逻辑自适应终端 Hook
  const { containerRef, handleClear } = useInteractiveTerminal({
    appId,
    chatId,
    outLinkAuthData
  });

  return (
    <Flex
      flexDirection="column"
      h="100%"
      bg="#1e1e1e"
      borderTop="1px solid"
      borderColor="myGray.700"
    >
      {/* 终端控制 Header */}
      <Flex
        h="32px"
        bg="#252526"
        px={3}
        alignItems="center"
        justifyContent="space-between"
        borderBottom="1px solid"
        borderColor="#3c3c3c"
      >
        <Flex alignItems="center" gap={4}>
          <Box color="#e1e1e1" fontSize="xs" fontWeight="semibold" textTransform="uppercase">
            {t('chat:sandbox_terminal', 'TERMINAL')}
          </Box>
        </Flex>
        <Flex alignItems="center" gap={2}>
          <Tooltip label={t('chat:sandbox_terminal_clear', 'Clear Terminal')}>
            <IconButton
              size="xs"
              variant="unstyled"
              aria-label="Clear Terminal"
              icon={<MyIcon name="delete" w="14px" color="#aeafad" />}
              onClick={handleClear}
              _hover={{ bg: '#37373d', color: '#ffffff' }}
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
            />
          </Tooltip>
          {onClose && (
            <Tooltip label={t('common:close', 'Close Panel')}>
              <IconButton
                size="xs"
                variant="unstyled"
                aria-label="Close Terminal"
                icon={<MyIcon name="common/closeLight" w="14px" color="#aeafad" />}
                onClick={onClose}
                _hover={{ bg: '#37373d', color: '#ffffff' }}
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
              />
            </Tooltip>
          )}
        </Flex>
      </Flex>

      {/* Xterm 挂载容器 */}
      <Box flex={1} ref={containerRef} overflow="hidden" p={2} position="relative" bg="#1e1e1e" />
    </Flex>
  );
};

export default React.memo(InteractiveTerminalCore);
