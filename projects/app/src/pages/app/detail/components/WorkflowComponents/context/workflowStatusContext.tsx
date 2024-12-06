import { useDebounceEffect } from 'ahooks';
import React, { ReactNode, useMemo, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { WorkflowInitContext, WorkflowNodeEdgeContext } from './workflowInitContext';
import { WorkflowContext } from '.';
import { AppContext } from '../../context';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { useTranslation } from 'next-i18next';

type WorkflowStatusContextType = {
  isSaved: boolean;
  leaveSaveSign: React.MutableRefObject<boolean>;
};

export const WorkflowStatusContext = createContext<WorkflowStatusContextType>({
  isSaved: false,
  // @ts-ignore
  leaveSaveSign: undefined
});

const WorkflowStatusContextProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const past = useContextSelector(WorkflowContext, (v) => v.past);
  const future = useContextSelector(WorkflowContext, (v) => v.future);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const [isSaved, setIsPublished] = useState(false);
  useDebounceEffect(
    () => {
      const savedSnapshot =
        [...future].reverse().find((snapshot) => snapshot.isSaved) ||
        past.find((snapshot) => snapshot.isSaved);

      const val = compareSnapshot(
        {
          nodes: savedSnapshot?.nodes,
          edges: savedSnapshot?.edges,
          chatConfig: savedSnapshot?.chatConfig
        },
        {
          nodes,
          edges,
          chatConfig: appDetail.chatConfig
        }
      );
      setIsPublished(val);
    },
    [future, past, nodes, edges, appDetail.chatConfig],
    {
      wait: 500
    }
  );

  const leaveSaveSign = useRef(true);

  // Lead check before unload
  const flowData2StoreData = useContextSelector(WorkflowContext, (v) => v.flowData2StoreData);
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  useBeforeunload({
    tip: t('common:core.common.tip.leave page'),
    callback: async () => {
      if (isSaved || !leaveSaveSign.current) return;
      console.log('Leave auto save');
      const data = flowData2StoreData();
      if (!data) return;
      await onSaveApp({
        ...data,
        isPublish: false,
        versionName: t('app:unusual_leave_auto_save'),
        chatConfig: appDetail.chatConfig
      });
    }
  });

  const contextValue = useMemo(() => {
    return {
      isSaved,
      leaveSaveSign
    };
  }, [isSaved]);
  return (
    <WorkflowStatusContext.Provider value={contextValue}>{children}</WorkflowStatusContext.Provider>
  );
};

export default WorkflowStatusContextProvider;
