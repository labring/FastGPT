import { useDebounceEffect, useLockFn, useMemoizedFn } from 'ahooks';
import React, { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { WorkflowInitContext, WorkflowNodeEdgeContext } from './workflowInitContext';
import { WorkflowContext } from '.';
import { AppContext } from '../../context';
import { compareSnapshot } from '@/web/core/workflow/utils';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { useTranslation } from 'next-i18next';
import { type Node } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '@fastgpt/global/core/workflow/template/input';
import { isProduction } from '@fastgpt/global/common/system/constants';

type WorkflowStatusContextType = {
  isSaved: boolean;
  leaveSaveSign: React.MutableRefObject<boolean>;
  resetParentNodeSizeAndPosition: (parentId: string) => void;
  getParentNodeSizeAndPosition: ({
    nodes,
    parentId
  }: {
    nodes: Node<FlowNodeItemType>[];
    parentId: string;
  }) =>
    | {
        parentX: number;
        parentY: number;
        childWidth: number;
        childHeight: number;
        nodeWidth: number;
        nodeHeight: number;
      }
    | undefined;
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
  const autoSaveFn = useLockFn(async () => {
    if (isSaved || !leaveSaveSign.current) return;
    console.log('Leave auto save');
    const data = flowData2StoreData();
    if (!data || data.nodes.length === 0) return;
    await onSaveApp({
      ...data,
      isPublish: false,
      chatConfig: appDetail.chatConfig,
      autoSave: true
    });
  });
  useEffect(() => {
    return () => {
      if (isProduction) {
        autoSaveFn();
      }
    };
  }, []);
  useBeforeunload({
    tip: t('common:core.tip.leave page'),
    callback: autoSaveFn
  });

  const onNodesChange = useContextSelector(WorkflowNodeEdgeContext, (state) => state.onNodesChange);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const getParentNodeSizeAndPosition = useMemoizedFn(
    ({ nodes, parentId }: { nodes: Node<FlowNodeItemType>[]; parentId: string }) => {
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
      const loopChilWidth =
        loopNode.data.inputs.find((node) => node.key === NodeInputKeyEnum.nodeWidth)?.value ?? 0;
      const loopChilHeight =
        loopNode.data.inputs.find((node) => node.key === NodeInputKeyEnum.nodeHeight)?.value ?? 0;

      // 初始化为第一个节点的边界
      let minX = childNodes[0].position.x;
      let minY = childNodes[0].position.y;
      let maxX = childNodes[0].position.x + (childNodes[0].width || 0);
      let maxY = childNodes[0].position.y + (childNodes[0].height || 0);

      // 遍历所有节点找出最小/最大边界
      childNodes.forEach((node) => {
        const nodeWidth = node.width || 0;
        const nodeHeight = node.height || 0;

        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + nodeWidth);
        maxY = Math.max(maxY, node.position.y + nodeHeight);
      });

      const childWidth = Math.max(maxX - minX + 80, 840);
      const childHeight = Math.max(maxY - minY + 80, 600);

      const diffWidth = childWidth - loopChilWidth;
      const diffHeight = childHeight - loopChilHeight;
      const targetNodeWidth = (loopNode.width ?? 0) + diffWidth;
      const targetNodeHeight = (loopNode.height ?? 0) + diffHeight;

      const offsetHeight =
        loopNode.data.inputs.find((input) => input.key === NodeInputKeyEnum.loopNodeInputHeight)
          ?.value ?? 83;

      return {
        parentX: Math.round(minX - 70),
        parentY: Math.round(minY - offsetHeight - 240),
        childWidth,
        childHeight,
        nodeWidth: targetNodeWidth,
        nodeHeight: targetNodeHeight
      };
    }
  );
  const resetParentNodeSizeAndPosition = useMemoizedFn((parentId: string) => {
    const res = getParentNodeSizeAndPosition({ nodes, parentId });
    if (!res) return;
    const { parentX, parentY, childWidth, childHeight } = res;

    // Update parentNode size and position
    onChangeNode({
      nodeId: parentId,
      type: 'updateInput',
      key: NodeInputKeyEnum.nodeWidth,
      value: {
        ...Input_Template_Node_Width,
        value: childWidth
      }
    });
    onChangeNode({
      nodeId: parentId,
      type: 'updateInput',
      key: NodeInputKeyEnum.nodeHeight,
      value: {
        ...Input_Template_Node_Height,
        value: childHeight
      }
    });
    // Update parentNode position
    onNodesChange([
      {
        id: parentId,
        type: 'position',
        position: {
          x: parentX,
          y: parentY
        }
      }
    ]);
  });

  const contextValue = useMemo(() => {
    return {
      isSaved,
      leaveSaveSign,
      resetParentNodeSizeAndPosition,
      getParentNodeSizeAndPosition
    };
  }, [isSaved, resetParentNodeSizeAndPosition, getParentNodeSizeAndPosition]);
  return (
    <WorkflowStatusContext.Provider value={contextValue}>{children}</WorkflowStatusContext.Provider>
  );
};

export default WorkflowStatusContextProvider;
