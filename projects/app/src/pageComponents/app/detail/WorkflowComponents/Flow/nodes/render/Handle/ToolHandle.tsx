import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, type BoxProps } from '@chakra-ui/react';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { type Connection, Handle, Position } from 'reactflow';
import { useCallback, useContext, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowUIContext } from '../../../context/workflowUIContext';
import {
  isConnectionTargetAllowed,
  useWorkflowActions,
  useWorkflowValue
} from '@/web/core/workflow/editor';
import { WorkflowHostContext } from '@/web/core/workflow/editor/host';
import { WorkflowHandleRenderContext } from './handleRenderContext';

const handleSize = '20px';
const activeHandleSize = '24px';
const handleId = NodeOutputKeyEnum.selectedTools;

type ToolHandleProps = BoxProps & {
  nodeId: string;
  show: boolean;
};
export const ToolTargetHandle = ({ show, nodeId }: ToolHandleProps) => {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  // 工具柄的可连接判定要读任意源节点与父节点：走 port 的非订阅节点读取，不挂整份文档图 reader。
  const runtime = useContextSelector(WorkflowHostContext, (v) => v.runtime);
  const connectingEdge = useContextSelector(WorkflowUIContext, (ctx) => ctx.connectingEdge);
  // 「本节点已被挂成工具」= 存在 targetHandle 为 selectedTools 的入边，走图索引 O(入度)。
  const connected = useWorkflowValue((_structure, graph) => graph.isMountedTool(nodeId));

  const active = useMemo(() => {
    if (!show || !runtime || connectingEdge?.handleId !== handleId) return false;

    // 与 ConnectionTargetHandle 同理：判定只吃 flowNodeType 与 parentNodeId，两者都只在结构变更时改变，
    // 而 connectingEdge 变化本身就会重渲染并重跑本 memo，所以读到的永远是当前值，不需要为它开节点订阅。
    const sourceNode = connectingEdge.nodeId ? runtime.getNode(connectingEdge.nodeId) : undefined;
    const targetNode = runtime.getNode(nodeId);

    return (
      !!sourceNode &&
      !!targetNode &&
      // context 在连线拖拽开始时由 Runtime 算好，工具柄只按 target 应用纯规则。
      isConnectionTargetAllowed({
        context: connectingEdge.context,
        targetNode,
        sourceParentNodeId: sourceNode.parentNodeId
      })
    );
  }, [connectingEdge, nodeId, runtime, show]);
  // if top handle is connected, return null
  const showHandle = active || connected;

  const size = active ? activeHandleSize : handleSize;

  const Render = useMemo(() => {
    return (
      <Handle
        style={{
          borderRadius: '0',
          backgroundColor: 'transparent',
          border: 'none',
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          top: active ? '-14px' : '-10px',
          zIndex: 30,
          ...(showHandle ? {} : { visibility: 'hidden' })
        }}
        type="target"
        id={handleId}
        position={Position.Top}
        isConnectableEnd={active}
        isConnectableStart={false}
      >
        <Box
          className="flow-handle"
          w={size}
          h={size}
          border={'4px solid #8774EE'}
          rounded={'xs'}
          bg={'white'}
          transform={'translate(0,0) rotate(45deg)'}
          pointerEvents={'none'}
        />
      </Handle>
    );
  }, [active, showHandle, size]);

  return renderHandle ? Render : null;
};

export const ToolSourceHandle = ({ nodeId }: { nodeId: string }) => {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  const { t } = useTranslation();
  // 边集合只在 onConnect 回调里读：走非订阅 getter，本组件对结构变更的订阅数为零。
  const { disconnectEdge, getEdges } = useWorkflowActions();
  const connectingEdge = useContextSelector(
    WorkflowUIContext,
    (ctx) => ctx.connectingEdge?.nodeId === nodeId
  );
  const nodeIsHover = useContextSelector(WorkflowUIContext, (v) => v.hoverNodeId === nodeId);

  const active = useMemo(() => nodeIsHover || connectingEdge, [nodeIsHover, connectingEdge]);

  /* onConnect edge, delete tool input and switch */
  const onConnect = useCallback(
    (e: Connection) => {
      getEdges()
        .filter(
          (edge) =>
            edge.target === e.target && edge.targetHandle !== NodeOutputKeyEnum.selectedTools
        )
        .forEach((edge) =>
          disconnectEdge({
            edge: {
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle || '',
              targetHandle: edge.targetHandle || ''
            }
          })
        );
    },
    [disconnectEdge, getEdges]
  );

  const size = active ? activeHandleSize : handleSize;

  const Render = useMemo(() => {
    return (
      <MyTooltip label={t('common:core.workflow.tool.Handle')} shouldWrapChildren={false}>
        <Handle
          style={{
            borderRadius: '0',
            backgroundColor: 'transparent',
            border: 'none',
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bottom: active ? '-14px' : '-10px',
            zIndex: 30
          }}
          type="source"
          id={NodeOutputKeyEnum.selectedTools}
          position={Position.Bottom}
          onConnect={onConnect}
        >
          <Box
            w={size}
            h={size}
            border={'4px solid #8774EE'}
            rounded={'xs'}
            bg={'white'}
            transform={'translate(0,0) rotate(45deg)'}
            pointerEvents={'none'}
          />
        </Handle>
      </MyTooltip>
    );
  }, [active, onConnect, size, t]);

  return renderHandle ? Render : null;
};

export default function Dom() {
  return <></>;
}
