import { useCallback, useEffect, useMemo, useState } from 'react';
import SandboxEditorModal from '@/pageComponents/chat/SandboxEditor/modal';
import type { IconButtonProps } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { checkSandboxExist } from './api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useContextSelector } from 'use-context-selector';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';

/**
 * useSandboxEditor —— UI Hook
 *
 * 职责：仅负责渲染 SandboxEditorModal 弹窗及其开关逻辑。
 * 性能：移除所有 fetch 逻辑与定时器。
 * 组件：供 ResponseTags 等细粒度组件调用，不产生额外网络开销。
 */
export const useSandboxEditor = ({
  appId,
  chatId,
  outLinkAuthData,
  onClose: onCloseCallback
}: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  onClose?: () => void;
}) => {
  const [sandboxModalOpen, setSandboxModalOpen] = useState(false);

  const onOpenSandboxModal = useCallback(() => {
    setSandboxModalOpen(true);
  }, []);

  const onCloseSandboxModal = useCallback(() => {
    setSandboxModalOpen(false);
    onCloseCallback?.();
  }, [onCloseCallback]);

  const SandboxEditorModalDom = useCallback(() => {
    return sandboxModalOpen ? (
      <SandboxEditorModal
        onClose={onCloseSandboxModal}
        appId={appId}
        chatId={chatId}
        outLinkAuthData={outLinkAuthData}
      />
    ) : null;
  }, [sandboxModalOpen, onCloseSandboxModal, appId, chatId, outLinkAuthData]);

  return {
    SandboxEditorModal: SandboxEditorModalDom,
    onOpenSandboxModal,
    onCloseSandboxModal
  };
};

/**
 * useSandboxStatus —— Status Hook
 *
 * 职责：负责 checkSandboxExist 的网络同步及 SandboxEntryIcon 的显示控制。
 * 同步模式：
 *   1. 历史记录（ChatRecordContext）：useMemo 派生，无副作用。
 *   2. chatId 切换：渲染期 `prevChatId !== chatId` 重置 API 状态（React 推荐的 during-render 更新模式）。
 *   3. 网络请求：单一 useEffect，仅在 chatId 变化时触发 1 次。
 * 组件：供 Header / ToolMenu 等单一顶层入口组件调用。
 */
export const useSandboxStatus = ({
  appId,
  chatId,
  outLinkAuthData
}: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  const { t } = useTranslation();
  const [prevChatId, setPrevChatId] = useState<string | undefined>(undefined);
  const [apiSandboxExists, setApiSandboxExists] = useState(false);

  if (prevChatId !== chatId) {
    setPrevChatId(chatId);
    setApiSandboxExists(false);
  }

  const chatRecords = useContextSelector(ChatRecordContext, (v) => {
    return v.chatRecords;
  });
  const isChatRecordsLoaded = useContextSelector(ChatRecordContext, (v) => v.isChatRecordsLoaded);

  const hasSandboxInHistory = useMemo(() => {
    if (!isChatRecordsLoaded) return false;
    return chatRecords.some((record) => {
      const enriched = addStatisticalDataToHistoryItem(record);
      return enriched.useAgentSandbox === true;
    });
  }, [chatRecords, isChatRecordsLoaded]);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    checkSandboxExist({ appId, chatId, outLinkAuthData })
      .then((result) => {
        if (!cancelled) setApiSandboxExists(result.exists);
      })
      .catch((error) => {
        console.error('Failed to check sandbox status:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [appId, chatId, outLinkAuthData]);

  const sandboxExists = hasSandboxInHistory || apiSandboxExists;

  const SandboxEntryIcon = useCallback(
    ({
      onOpen,
      ...props
    }: Omit<IconButtonProps, 'name' | 'onClick' | 'aria-label'> & { onOpen: () => void }) => {
      if (!sandboxExists) return null;

      return (
        <MyTooltip label={t('chat:sandbox_entry_tooltip')}>
          <IconButton
            variant={'whiteBase'}
            size={'smSquare'}
            icon={<MyIcon name={'core/app/sandbox/file'} w={'16px'} />}
            onClick={onOpen}
            {...props}
            aria-label="Sandbox Entry"
          />
        </MyTooltip>
      );
    },
    [sandboxExists, t]
  );

  return {
    sandboxExists,
    setSandboxExists: setApiSandboxExists,
    SandboxEntryIcon
  };
};
