import React, { createContext, useCallback, useMemo, useRef } from 'react';
import { webPushTrack } from '@/web/common/middle/tracks/utils';

export const WorkflowBuilderTrackingContext = createContext<
  | {
      appId: string;
      registerPreview: (previewId: string) => void;
      showPreview: (previewId: string) => void;
    }
  | undefined
>(undefined);

/** 只登记当前正常生成流的新预览；编辑会话内跨卸载去重，历史/恢复不登记也不上报预览ID。 */
export const WorkflowBuilderTrackingProvider = ({
  appId,
  children
}: React.PropsWithChildren<{ appId: string }>) => {
  const previews = useRef(new Map<string, boolean>());
  const registerPreview = useCallback((previewId: string) => {
    if (!previews.current.has(previewId)) previews.current.set(previewId, false);
  }, []);
  const showPreview = useCallback(
    (previewId: string) => {
      if (previews.current.get(previewId) !== false) return;
      previews.current.set(previewId, true);
      void webPushTrack.workflowBuilder({ appId, action: 'preview_shown' });
    },
    [appId]
  );
  const value = useMemo(
    () => ({ appId, registerPreview, showPreview }),
    [appId, registerPreview, showPreview]
  );
  return (
    <WorkflowBuilderTrackingContext.Provider value={value}>
      {children}
    </WorkflowBuilderTrackingContext.Provider>
  );
};
