import { useCallback, useState } from 'react';
import SandboxEditorModal from '@/pageComponents/chat/SandboxEditor/modal';
import type { IconButtonProps } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import { SANDBOX_ICON } from '@fastgpt/global/core/ai/sandbox/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';

export const useSandboxEditor = (data: { appId: string; chatId: string }) => {
  // Sandbox state
  const [sandboxModalOpen, setSandboxModalOpen] = useState(false);

  const onOpenSandboxModal = () => {
    setSandboxModalOpen(true);
  };

  const onCloseSandboxModal = () => {
    setSandboxModalOpen(false);
  };

  const Dom = useCallback(() => {
    return sandboxModalOpen ? (
      <SandboxEditorModal onClose={onCloseSandboxModal} appId={data.appId} chatId={data.chatId} />
    ) : null;
  }, [sandboxModalOpen, data.appId, data.chatId]);

  const SandboxEntryIcon = useCallback(
    (props: Omit<IconButtonProps, 'name' | 'onClick' | 'aria-label'>) => {
      return (
        <IconButton
          variant={'whiteBase'}
          icon={<MyIcon name={SANDBOX_ICON} w={'16px'} />}
          onClick={onOpenSandboxModal}
          {...props}
          aria-label="Sandbox Entry"
        />
      );
    },
    [onOpenSandboxModal]
  );

  return {
    SandboxEntryIcon,
    SandboxEditorModal: Dom,
    onOpenSandboxModal,
    onCloseSandboxModal
  };
};
