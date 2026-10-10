import React, { useContext, useMemo } from 'react';
import { Position } from 'reactflow';
import { MySourceHandle, MyTargetHandle } from '.';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { isConnectionTargetAllowed } from '@fastgpt/global/core/workflow/editor/utils';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { useContextSelector } from 'use-context-selector';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { getIfElseBranchHandleKey } from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflow } from '@/web/core/workflow/editor/react/useWorkflow';
import { useWorkflowRuntime } from '@/web/core/workflow/editor/session/workflowSession';
import { useWorkflowUIValue } from '../../../canvas/canvasState';
import { WorkflowHandleRenderContext } from './handleRenderContext';

/** 目标柄与折叠分支源柄的平移量：模块级常量，避免每次渲染换数组身份打穿 React.memo。 */
const sourceTranslate = [4, 0] as [number, number];
const targetTranslate = [-4, 0] as [number, number];

export const ConnectionSourceHandle = ({
  nodeId,
  sourceType = 'source'
}: {
  nodeId: string;
  sourceType?: 'source' | 'source_catch';
}) => {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const nodeHandle = useNode(nodeId, { raw: true });
  // 只关心「是不是别的节点在拖拽连线」这一个事实，不取回整个 connectingEdge 对象。
  const isConnectingOther = useWorkflowUIValue(
    (v) => !!v.connectingEdge && v.connectingEdge.nodeId !== nodeId
  );
  // 右侧 target 柄已被占用时不再显示 source 柄：走图查询的 byTarget 索引，O(入度)。
  const rightTargetConnected = useWorkflow((_structure, graph) =>
    graph.isHandleConnected({
      nodeId,
      handleId: getHandleId(nodeId, 'target', Position.Right),
      direction: 'target'
    })
  );

  const { showSourceHandle, RightHandle } = useMemo(() => {
    const node = nodeHandle?.data;

    /* not node/not connecting node, hidden */
    const showSourceHandle = (() => {
      if (!node) return false;
      if (isConnectingOther) return false;
      return true;
    })();

    const RightHandle = (() => {
      // When the node is folded and has multiple branches, only render the first output.
      if (node && nodeHandle?.view.isFolded) {
        const firstHandleId = (() => {
          if (node.flowNodeType === FlowNodeTypeEnum.userSelect) {
            const options = node?.inputs?.find(
              (input) => input.key === NodeInputKeyEnum.userSelectOptions
            )?.value;
            if (options && options.length > 0) {
              return getHandleId(nodeId, 'source', options[0].key);
            }
          } else if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
            const ifElseList = node.inputs.find(
              (input) => input.key === NodeInputKeyEnum.ifElseList
            )?.value as IfElseListItemType[] | undefined;
            const firstIfElse = ifElseList?.[0];
            if (firstIfElse) {
              return getHandleId(nodeId, 'source', getIfElseBranchHandleKey(firstIfElse));
            }
          } else if (node.flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
            const options = node?.inputs?.find(
              (input) => input.key === NodeInputKeyEnum.agents
            )?.value;
            if (options && options.length > 0) {
              return getHandleId(nodeId, 'source', options[0].key);
            }
          }
        })();

        if (firstHandleId) {
          return (
            <MySourceHandle
              nodeId={nodeId}
              handleId={firstHandleId}
              position={Position.Right}
              translate={sourceTranslate}
            />
          );
        }
      }

      const handleId = getHandleId(nodeId, sourceType, Position.Right);
      // 连接柄显隐由当前模板决定：文档节点不携带模板展示字段。
      const templateShowSourceHandle = node
        ? moduleTemplatesFlat.find((item) => item.flowNodeType === node.flowNodeType)
            ?.showSourceHandle
        : undefined;
      if (!node || !templateShowSourceHandle || rightTargetConnected) {
        return null;
      }

      return (
        <MySourceHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Right}
          translate={sourceTranslate}
        />
      );
    })();

    return {
      showSourceHandle,
      RightHandle
    };
  }, [nodeHandle, nodeId, isConnectingOther, sourceType, rightTargetConnected]);

  return renderHandle && showSourceHandle ? <>{RightHandle}</> : null;
};

export const ConnectionTargetHandle = React.memo(function ConnectionTargetHandle({
  nodeId
}: {
  nodeId: string;
}) {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const connectingEdge = useWorkflowUIValue((v) => v.connectingEdge);
  // 目标柄要按拖拽源节点的父容器判定上下文，直接读 port 的节点快照，不再挂整份文档图 reader。
  const runtime = useWorkflowRuntime();

  /**
   * 禁止连接的图判定：本节点已被挂成工具，或本次拖拽的 source handle 已经连到本节点。
   * 两个条件都走图索引（byTarget），复杂度从每条边全量扫 O(E) 降到 O(入度)。
   */
  const forbidConnectByGraph = useWorkflow(
    (_structure, graph) =>
      graph.isMountedTool(nodeId) ||
      (!!connectingEdge &&
        graph
          .getIncomingEdges(nodeId)
          .some((edge) => edge.sourceHandle === connectingEdge.handleId))
  );

  const { LeftHandle } = useMemo(() => {
    // 这里刻意用 port 的非订阅读取而不是 useNode：判定只吃 flowNodeType 与 parentNodeId，
    // 两者都只在结构变更时改变，而 parentNodeId 只在 connectingEdge 存在时被消费；
    // connectingEdge 变化本身就会重渲染并重跑本 memo，所以读到的永远是当前值。
    // 换成 useNode 会让本节点的几何提交、字段写入与 issue 刷新都带动目标柄重渲染。
    const node = runtime?.getNode(nodeId);
    const connectingNode = connectingEdge?.nodeId
      ? runtime?.getNode(connectingEdge.nodeId)
      : undefined;

    let forbidConnect = forbidConnectByGraph;

    // 目标节点容器或模板上下文不允许时禁止连接（与 Tool 柄及最终提交共用规则）；
    // context 在连线拖拽开始时由 Runtime 算好，这里只按 target 应用纯规则。
    if (node && connectingNode && connectingEdge) {
      if (
        !isConnectionTargetAllowed({
          context: connectingEdge.context,
          targetNode: node,
          sourceParentNodeId: connectingNode.parentNodeId
        })
      ) {
        forbidConnect = true;
      }
    }

    const showHandle = (() => {
      if (forbidConnect) return false;
      if (!node) return false;

      // Tool connecting
      if (connectingEdge && connectingEdge.handleId === NodeOutputKeyEnum.selectedTools)
        return false;

      // Unable to connect oneself
      if (connectingEdge && connectingEdge.nodeId === nodeId) return false;
      // Not the same parent node
      if (connectingNode && connectingNode?.parentNodeId !== node?.parentNodeId) return false;

      return true;
    })();

    const LeftHandle = (() => {
      // 同 source 柄：显隐看当前模板，文档节点不携带模板展示字段。
      const showTargetHandle = node
        ? moduleTemplatesFlat.find((item) => item.flowNodeType === node.flowNodeType)
            ?.showTargetHandle
        : undefined;
      if (!node || !showTargetHandle) return null;

      const handleId = getHandleId(nodeId, 'target', Position.Left);

      return (
        <MyTargetHandle
          nodeId={nodeId}
          handleId={handleId}
          position={Position.Left}
          translate={targetTranslate}
          showHandle={showHandle}
        />
      );
    })();

    return {
      showHandle,
      LeftHandle
    };
  }, [connectingEdge, nodeId, runtime, forbidConnectByGraph]);

  return renderHandle ? <>{LeftHandle}</> : null;
});

export default function Dom() {
  return <></>;
}
