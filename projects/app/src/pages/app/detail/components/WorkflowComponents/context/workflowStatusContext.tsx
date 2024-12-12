import { useDebounceEffect, useMemoizedFn } from 'ahooks';
import React, { ReactNode, useMemo, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { WorkflowInitContext, WorkflowNodeEdgeContext } from './workflowInitContext';
import { WorkflowContext } from '.';
import { AppContext } from '../../context';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { useTranslation } from 'next-i18next';
import { getNodesBounds, Node } from 'reactflow';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '@fastgpt/global/core/workflow/template/input';

type WorkflowStatusContextType = {
  isSaved: boolean;
  leaveSaveSign: React.MutableRefObject<boolean>;
  resetParentNodeSizeAndPosition: (parentId: string) => void;
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

  const onNodesChange = useContextSelector(WorkflowNodeEdgeContext, (state) => state.onNodesChange);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const resetParentNodeSizeAndPosition = useMemoizedFn((parentId: string) => {
    const { childNodes, loopNode } = nodes.reduce(
      (acc, node) => {
        if (node.data.parentNodeId === parentId) {
          acc.childNodes.push(node);
        }
        if (node.id === parentId) {
          acc.loopNode = node;
        }
        return acc;
      },
      { childNodes: [] as Node[], loopNode: undefined as Node<FlowNodeItemType> | undefined }
    );

    if (!loopNode) return;

    const rect = getNodesBounds(childNodes);
    // Calculate parent node size with minimum width/height constraints
    const width = Math.max(rect.width + 80, 840);
    const height = Math.max(rect.height + 80, 600);

    const offsetHeight =
      loopNode.data.inputs.find((input) => input.key === NodeInputKeyEnum.loopNodeInputHeight)
        ?.value ?? 83;

    // Update parentNode size and position
    onChangeNode({
      nodeId: parentId,
      type: 'updateInput',
      key: NodeInputKeyEnum.nodeWidth,
      value: {
        ...Input_Template_Node_Width,
        value: width
      }
    });
    onChangeNode({
      nodeId: parentId,
      type: 'updateInput',
      key: NodeInputKeyEnum.nodeHeight,
      value: {
        ...Input_Template_Node_Height,
        value: height
      }
    });
    // Update parentNode position
    onNodesChange([
      {
        id: parentId,
        type: 'position',
        position: {
          x: Math.round(rect.x - 70),
          y: Math.round(rect.y - offsetHeight - 240)
        }
      }
    ]);
  });

  const contextValue = useMemo(() => {
    return {
      isSaved,
      leaveSaveSign,
      resetParentNodeSizeAndPosition
    };
  }, [isSaved, resetParentNodeSizeAndPosition]);
  return (
    <WorkflowStatusContext.Provider value={contextValue}>{children}</WorkflowStatusContext.Provider>
  );
};

export default WorkflowStatusContextProvider;
