import { useCallback, useState } from 'react';
import SandboxEditorModal from '@/pageComponents/chat/SandboxEditor/modal';
import type { IconButtonProps } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { checkSandboxExist } from './api';
import { useInterval } from 'ahooks';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

export const useSandboxEditor = ({
  appId,
  chatId,
  outLinkAuthData
}: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  const { t } = useTranslation();
  // Sandbox state
  const [sandboxModalOpen, setSandboxModalOpen] = useState(false);
  const [sandboxExists, setSandboxExists] = useState(false);

  // 检查沙盒是否存在
  const checkSandboxStatus = useCallback(async () => {
    try {
      const result = await checkSandboxExist({ appId, chatId, outLinkAuthData });
      setSandboxExists(result.exists);
    } catch (error) {
      console.error('Failed to check sandbox status:', error);
    }
  }, [appId, chatId, outLinkAuthData]);

  // 组件挂载时检查
  useInterval(checkSandboxStatus, 10000, {
    immediate: true
  });

  const onOpenSandboxModal = useCallback(() => {
    setSandboxModalOpen(true);
  }, []);

  const onCloseSandboxModal = useCallback(() => {
    setSandboxModalOpen(false);
    // 关闭后重新检查状态
    checkSandboxStatus();
  }, [checkSandboxStatus]);

  const Dom = useCallback(() => {
    return sandboxModalOpen ? (
      <SandboxEditorModal
        onClose={onCloseSandboxModal}
        appId={appId}
        chatId={chatId}
        outLinkAuthData={outLinkAuthData}
      />
    ) : null;
  }, [sandboxModalOpen, onCloseSandboxModal, appId, chatId, outLinkAuthData]);

  const SandboxEntryIcon = useCallback(
    (props: Omit<IconButtonProps, 'name' | 'onClick' | 'aria-label'>) => {
      // 只有沙盒存在时才显示图标
      if (!sandboxExists) return null;

      return (
        <MyTooltip label={t('chat:sandbox_entry_tooltip')}>
          <IconButton
            variant={'whiteBase'}
            size={'smSquare'}
            icon={<MyIcon name={'core/app/sandbox/file'} w={'16px'} />}
            onClick={onOpenSandboxModal}
            {...props}
            aria-label="Sandbox Entry"
          />
        </MyTooltip>
      );
    },
    [sandboxExists, t, onOpenSandboxModal]
  );

  return {
    sandboxExists,
    setSandboxExists,
    checkSandboxStatus,
    SandboxEntryIcon,
    SandboxEditorModal: Dom,
    onOpenSandboxModal,
    onCloseSandboxModal
  };
};
