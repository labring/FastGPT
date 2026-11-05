import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import type { ShareChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { postOutLinkBrandTrack } from '@/web/core/chat/api';

export type ShareBrandSession = {
  eventId: string;
  exposed: boolean;
  pending?: Promise<void>;
  attempts?: number;
  rateLimited?: boolean;
};

/** 可见事件触发曝光，仅失败后延迟重试；同一页面的请求和去重状态跨布局保留。 */
export const useShareBrandTracking = ({
  element,
  session,
  outLinkAuthData,
  enabled
}: {
  element: RefObject<HTMLDivElement | null>;
  session: MutableRefObject<ShareBrandSession>;
  outLinkAuthData?: ShareChatAuthProps;
  enabled: boolean;
}) => {
  useEffect(() => {
    if (
      !enabled ||
      !outLinkAuthData?.shareId ||
      !outLinkAuthData.outLinkUid ||
      session.current.exposed ||
      session.current.rateLimited ||
      (session.current.attempts ?? 0) >= 3 ||
      !element.current
    )
      return;

    let active = true;
    let intersecting = false;
    const isFloatingWindow = window.name === 'fastgpt-chatbot-window';
    // 悬浮窗口预加载时等待宿主握手，不能仅按 iframe 内部可见性判断。
    let hostVisible = !isFloatingWindow;
    let parentOrigin: string | undefined;
    let retryTimer: number | undefined;
    const canReport = () =>
      active &&
      intersecting &&
      hostVisible &&
      document.visibilityState === 'visible' &&
      !session.current.exposed &&
      !session.current.rateLimited &&
      (session.current.attempts ?? 0) < 3;

    const scheduleRetry = () => {
      if (!canReport() || retryTimer !== undefined) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void report();
      }, 1000);
    };

    /** 新布局等待旧布局的在途请求；只有失败且仍可见时才安排下一次尝试。 */
    const report = async () => {
      if (!canReport() || retryTimer !== undefined) return;
      if (!session.current.pending) {
        session.current.attempts = (session.current.attempts ?? 0) + 1;
        session.current.pending = postOutLinkBrandTrack({
          event: TrackEnum.shareBrandExposure,
          eventId: session.current.eventId,
          outLinkAuthData
        })
          .then(() => {
            session.current.exposed = true;
          })
          .catch((error: unknown) => {
            // 429 后停止本页重试，未确认入库的曝光仍保持未成功状态。
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              error.code === 429
            ) {
              session.current.rateLimited = true;
            }
          })
          .finally(() => {
            session.current.pending = undefined;
          });
      }
      await session.current.pending;
      scheduleRetry();
    };

    const onVisibilityChange = () => {
      if (!canReport()) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
        return;
      }
      void report();
    };
    const onHostMessage = (event: MessageEvent) => {
      if (
        !isFloatingWindow ||
        event.source !== window.parent ||
        event.data?.type !== 'fastgpt:host-visibility' ||
        typeof event.data.visible !== 'boolean' ||
        event.origin === 'null'
      )
        return;
      if (parentOrigin === undefined) {
        if (event.data.handshake !== true) return;
        parentOrigin = event.origin;
      }
      if (event.origin !== parentOrigin) return;
      hostVisible = event.data.visible;
      onVisibilityChange();
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting && entry.intersectionRatio > 0;
      onVisibilityChange();
    });
    observer.observe(element.current);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('message', onHostMessage);
    if (isFloatingWindow && window.parent !== window) {
      window.parent.postMessage({ type: 'fastgpt:visibility-ready' }, '*');
    }
    return () => {
      active = false;
      observer.disconnect();
      window.clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('message', onHostMessage);
    };
  }, [element, enabled, session, outLinkAuthData]);

  return useCallback(() => {
    if (!enabled || !outLinkAuthData?.shareId || !outLinkAuthData.outLinkUid) return;
    void postOutLinkBrandTrack({
      event: TrackEnum.shareBrandClick,
      outLinkAuthData
    }).catch(() => {});
  }, [enabled, outLinkAuthData]);
};
