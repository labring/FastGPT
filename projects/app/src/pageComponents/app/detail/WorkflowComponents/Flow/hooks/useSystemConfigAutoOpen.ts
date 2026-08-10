import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { SYSTEM_CONFIG_AUTO_OPEN_QUERY_KEY } from '@/web/core/app/utils';

/**
 * 在功能首次使用或新建工作流首次进入时主动展开系统配置。
 * 新建标记只通过路由传递并在读取后移除；全局首次引导状态保存在编辑器 UI 偏好中。
 */
export const useSystemConfigAutoOpen = ({
  appId,
  hasCompletedFirstEntryGuide,
  onCompleteFirstEntryGuide,
  onOpen
}: {
  appId: string;
  hasCompletedFirstEntryGuide: boolean;
  onCompleteFirstEntryGuide: () => void;
  onOpen: () => void;
}) => {
  const router = useRouter();
  const handledAppIdRef = useRef<string>();

  useEffect(() => {
    if (!router.isReady || !appId || handledAppIdRef.current === appId) return;

    const autoOpenQuery = router.query[SYSTEM_CONFIG_AUTO_OPEN_QUERY_KEY];
    const shouldOpenForNewApp = Array.isArray(autoOpenQuery)
      ? autoOpenQuery.includes('1')
      : autoOpenQuery === '1';
    const shouldOpenForFirstEntry = !hasCompletedFirstEntryGuide;

    handledAppIdRef.current = appId;

    if (shouldOpenForNewApp) {
      const nextQuery = { ...router.query };
      delete nextQuery[SYSTEM_CONFIG_AUTO_OPEN_QUERY_KEY];
      void router.replace(
        {
          pathname: router.pathname,
          query: nextQuery
        },
        undefined,
        { shallow: true }
      );
    }

    if (!shouldOpenForNewApp && !shouldOpenForFirstEntry) return;

    onOpen();

    if (shouldOpenForFirstEntry) {
      onCompleteFirstEntryGuide();
    }
  }, [appId, hasCompletedFirstEntryGuide, onCompleteFirstEntryGuide, onOpen, router]);
};
