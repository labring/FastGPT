import React, { useContext, useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import { WorkflowUIContext } from '../../../context/workflowUIContext';
import { WorkflowSelectionContext } from '../../../context/workflowSelectionContext';
import { useWorkflowValue } from '@/web/core/workflow/editor';
import { WorkflowHandleRenderContext } from './handleRenderContext';

const handleSizeConnected = 24;
const handleSizeConnecting = 32;
const handleAddIconSize = 24;

const sourceCommonStyle = {
  backgroundColor: 'white',
  borderRadius: '50%'
};

const handleConnectedStyle = {
  ...sourceCommonStyle,
  borderWidth: '3px',
  borderColor: '#94B5FF',
  width: handleSizeConnected,
  height: handleSizeConnected,
  zIndex: 15
};

const handleHighLightStyle = {
  ...sourceCommonStyle,
  borderWidth: '4px',
  borderColor: '#487FFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: handleSizeConnecting,
  height: handleSizeConnecting,
  zIndex: 15
};

type Props = {
  nodeId: string;
  handleId: string;
  position: Position;
  translate?: [number, number];
};

export const MySourceHandle = React.memo(function MySourceHandle({
  nodeId,
  translate,
  handleId,
  position
}: Props) {
  const { t } = useTranslation();
  const renderHandle = useContext(WorkflowHandleRenderContext);

  // 连通判定走 Runtime 图查询（bySource 索引，O(出度)），selector 只返回 boolean，
  // 别处连线/断线不会让这个 handle 重渲染。
  const connected = useWorkflowValue((_structure, graph) =>
    graph.isHandleConnected({ nodeId, handleId, direction: 'source' })
  );
  const selected = useContextSelector(WorkflowSelectionContext, (v) => v.selectedNodesMap[nodeId]);
  // connectingEdge 有两个互相独立的用途，各取一个 boolean，不把整个对象取回来：
  // 本 handle 是不是拖拽源（高亮），以及是否正在从 tool 柄拖拽（此时隐藏所有 source 柄）。
  const isConnectingSelf = useContextSelector(
    WorkflowUIContext,
    (v) => v.connectingEdge?.handleId === handleId
  );
  const isConnectingTool = useContextSelector(
    WorkflowUIContext,
    (v) => v.connectingEdge?.handleId === NodeOutputKeyEnum.selectedTools
  );
  const nodeIsHover = useContextSelector(WorkflowUIContext, (v) => v.hoverNodeId === nodeId);

  const active = nodeIsHover || !!selected || isConnectingSelf;

  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Right) {
      const offset = active ? 8 : 5;
      return `${translate[0] + offset}px, -50%`;
    }
  }, [active, position, translate]);

  const { styles, showAddIcon } = useMemo(() => {
    if (active) {
      return {
        styles: {
          ...handleHighLightStyle,
          transform: `${translateStr ? `translate(${translateStr})` : ''}`
        },
        showAddIcon: true
      };
    }

    if (connected) {
      return {
        styles: {
          ...handleConnectedStyle,
          transform: `${translateStr ? `translate(${translateStr})` : ''}`
        },
        showAddIcon: false
      };
    }

    return {
      styles: {
        visibility: 'hidden' as const
      },
      showAddIcon: false
    };
  }, [active, connected, translateStr]);

  if (!renderHandle || isConnectingTool) return null;

  return (
    <MyTooltip
      label={
        <Box>
          <Flex>
            <Box color={'myGray.900'}>{t('workflow:Click')}</Box>
            <Box color={'myGray.600'}>{t('workflow:to_add_node')}</Box>
          </Flex>
          <Flex>
            <Box color={'myGray.900'}>{t('workflow:Drag')}</Box>
            <Box color={'myGray.600'}>{t('workflow:to_connect_node')}</Box>
          </Flex>
        </Box>
      }
      shouldWrapChildren={false}
    >
      <Handle
        style={styles}
        type="source"
        id={handleId}
        position={position}
        isConnectableEnd={false}
      >
        {showAddIcon && (
          <MyIcon
            name={'edgeAdd'}
            color={'primary.500'}
            pointerEvents={'none'}
            w={`${handleAddIconSize}px`}
            h={`${handleAddIconSize}px`}
          />
        )}
      </Handle>
    </MyTooltip>
  );
});

export const MyTargetHandle = React.memo(function MyTargetHandle({
  nodeId,
  handleId,
  position,
  translate,
  showHandle
}: Props & {
  showHandle: boolean;
}) {
  const renderHandle = useContext(WorkflowHandleRenderContext);
  // 同 MySourceHandle：图查询按 byTarget 索引算连通，只返回 boolean。
  const connected = useWorkflowValue((_structure, graph) =>
    graph.isHandleConnected({ nodeId, handleId, direction: 'target' })
  );
  // 这里只需要「有没有在拖拽连线」这一个事实，不需要 connectingEdge 对象本身。
  const isConnecting = useContextSelector(WorkflowUIContext, (v) => !!v.connectingEdge);

  const translateStr = useMemo(() => {
    if (!translate) return '';

    if (position === Position.Left) {
      const offset = isConnecting ? -8 : -5;
      return `${translate[0] + offset}px, -50%`;
    }
  }, [isConnecting, position, translate]);

  const styles = useMemo(() => {
    if ((!isConnecting && !connected) || !showHandle) {
      return {
        visibility: 'hidden' as const
      };
    }

    if (isConnecting) {
      return {
        ...handleHighLightStyle,
        transform: `${translateStr ? `translate(${translateStr})` : ''}`
      };
    }

    if (connected) {
      return {
        ...handleConnectedStyle,
        transform: `${translateStr ? `translate(${translateStr})` : ''}`
      };
    }
    return {
      visibility: 'hidden' as const,
      zIndex: 15
    };
  }, [connected, isConnecting, showHandle, translateStr]);

  if (!renderHandle) return null;

  return (
    <Handle
      style={styles}
      isConnectableEnd={styles && showHandle}
      isConnectableStart={false}
      type="target"
      id={handleId}
      position={position}
    />
  );
});

export default function Dom() {
  return <></>;
}
