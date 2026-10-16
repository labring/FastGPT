import React from 'react';
import { Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

/** 桌面侧栏和移动应用列表共用的清除入口，操作失败时保留列表并允许重试。 */
const ClearRecentlyUsedApps = () => {
  const { t } = useTranslation();
  const hasApps = useContextSelector(ChatPageContext, (v) => v.myApps.length > 0);
  const clearRecentlyUsed = useContextSelector(ChatPageContext, (v) => v.clearRecentlyUsed);
  const { runAsync, loading } = useRequest(clearRecentlyUsed);
  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('chat:confirm_clear_recent_apps')
  });

  return (
    <>
      <Button
        size={'xs'}
        variant={'whiteBase'}
        isDisabled={!hasApps}
        isLoading={loading}
        onClick={() => openConfirm({ onConfirm: runAsync })()}
        aria-label={t('chat:clear_recent_apps')}
      >
        {t('common:Clear')}
      </Button>
      <ConfirmModal />
    </>
  );
};

export default React.memo(ClearRecentlyUsedApps);
