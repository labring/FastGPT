import { useCallback, useState } from 'react';
import SandboxEditorModal from '@/pageComponents/chat/SandboxEditor/modal';
import type { IconButtonProps } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import { SANDBOX_ICON } from '@fastgpt/global/core/ai/sandbox/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { checkSandboxExist } from './api';
import { useInterval } from 'ahooks';

export const useSandboxEditor = (data: { appId: string; chatId: string }) => {
  // Sandbox state
  const [sandboxModalOpen, setSandboxModalOpen] = useState(false);
  const [sandboxExists, setSandboxExists] = useState(false);

  // 检查沙盒是否存在
  const checkSandboxStatus = useCallback(async () => {
    try {
      const result = await checkSandboxExist({
        appId: data.appId,
        chatId: data.chatId
      });
      setSandboxExists(result.exists);
    } catch (error) {
      console.error('Failed to check sandbox status:', error);
    }
  }, [data.appId, data.chatId]);

  // 组件挂载时检查
  useInterval(checkSandboxStatus, 10000, {
    immediate: true
  });

  const onOpenSandboxModal = () => {
    setSandboxModalOpen(true);
  };

  const onCloseSandboxModal = () => {
    setSandboxModalOpen(false);
    // 关闭后重新检查状态
    checkSandboxStatus();
  };

  const Dom = useCallback(() => {
    return sandboxModalOpen ? (
      <SandboxEditorModal onClose={onCloseSandboxModal} appId={data.appId} chatId={data.chatId} />
    ) : null;
  }, [sandboxModalOpen, data.appId, data.chatId]);

  const SandboxEntryIcon = useCallback(
    (props: Omit<IconButtonProps, 'name' | 'onClick' | 'aria-label'>) => {
      // 只有沙盒存在时才显示图标
      if (!sandboxExists) return null;

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
    [sandboxExists, onOpenSandboxModal]
  );

  return {
    setSandboxExists,
    checkSandboxStatus,
    SandboxEntryIcon,
    SandboxEditorModal: Dom,
    onOpenSandboxModal,
    onCloseSandboxModal
  };
};
