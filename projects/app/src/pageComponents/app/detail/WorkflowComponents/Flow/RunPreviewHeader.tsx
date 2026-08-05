import React from 'react';
import { Box, CloseButton, Flex, IconButton, type IconButtonProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import ChatVariableButton from '@/pageComponents/chat/ChatWindow/ChatVariableButton';

const RunPreviewHeader = ({
  title,
  chatId,
  chatIdLabel,
  restartLabel,
  closeLabel,
  SandboxEntryIcon,
  onCopyChatId,
  onOpenSandboxModal,
  onRestart,
  onClose
}: {
  title: string;
  chatId: string;
  chatIdLabel: string;
  restartLabel: string;
  closeLabel: string;
  SandboxEntryIcon: React.ComponentType<
    Omit<IconButtonProps, 'name' | 'onClick' | 'aria-label'> & { onOpen: () => void }
  >;
  onCopyChatId: () => void;
  onOpenSandboxModal: () => void;
  onRestart: () => void;
  onClose: () => void;
}) => {
  return (
    <>
      <MyTooltip label={chatId ? chatIdLabel : ''}>
        <Box cursor="pointer" onClick={onCopyChatId}>
          {title}
        </Box>
      </MyTooltip>

      <Flex position="absolute" right="24px" alignItems="center" gap={2}>
        <SandboxEntryIcon onOpen={onOpenSandboxModal} />
        <ChatVariableButton chatType={ChatTypeEnum.test} />
        <MyTooltip label={restartLabel}>
          <IconButton
            className="chat"
            size="smSquare"
            icon={<MyIcon name="common/clearLight" w="14px" />}
            variant="whiteDanger"
            borderRadius="md"
            aria-label={restartLabel}
            onClick={onRestart}
          />
        </MyTooltip>
        <MyTooltip label={closeLabel}>
          <CloseButton size={'sm'} aria-label={closeLabel} onClick={onClose} />
        </MyTooltip>
      </Flex>
    </>
  );
};

export default React.memo(RunPreviewHeader);
