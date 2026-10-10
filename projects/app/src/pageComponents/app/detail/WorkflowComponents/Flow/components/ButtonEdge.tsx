import React, { useCallback, useMemo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
  type ConnectionLineComponentProps
} from 'reactflow';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useThrottleEffect } from 'ahooks';
import { useWorkflowDebugValue } from '../../debug/workflowDebugSession';
import { useWorkflowUIValue } from '../canvas/canvasState';
import { useWorkflowSelectionValue } from '../context/workflowSelectionContext';
import { getCustomStepPath } from '../utils/edge';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions, useWorkflow } from '@/web/core/workflow/editor/react/useWorkflow';

export const CustomConnectionLine = ({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition
}: ConnectionLineComponentProps) => {
  const [path] = getCustomStepPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    borderRadius: 60
  });

  return (
    <g>
      <path d={path} fill="none" stroke="#487FFF" strokeWidth={3} />
    </g>
  );
};

const ButtonEdge = (props: EdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    source,
    sourceHandleId,
    target,
    targetHandleId,
    style
  } = props;

  // 四个订阅全部收窄成本边关心的原始值，选中/hover/debug 的无关变更不再重渲染这条边。
  const endpointSelected = useWorkflowSelectionValue(
    (v) => !!(v.selectedNodesMap[source] || v.selectedNodesMap[target])
  );
  // debug 态下本边（按 handle 精确匹配）的状态；不在 debug 或没匹配到 runtime 边时为 undefined。
  const debugStatus = useWorkflowDebugValue(
    (v) =>
      v.workflowDebugData?.runtimeEdges.find(
        (edge) => edge.sourceHandle === sourceHandleId && edge.targetHandle === targetHandleId
      )?.status
  );
  // debug 态下两端点之间是否存在 runtime 边：只用来决定线宽，不需要整条边数据。
  const hasDebugEndpoints = useWorkflowDebugValue(
    (v) =>
      !!v.workflowDebugData?.runtimeEdges.some(
        (edge) => edge.source === source && edge.target === target
      )
  );
  const isHover = useWorkflowUIValue((v) => v.hoverEdgeId === id);
  // 结构订阅只剩一个用途：结构变了要重算同源边偏移。写命令走稳定 action 句柄，订阅数为零。
  const structureEdges = useWorkflow((structure) => structure.edges);
  const { disconnectEdge } = useWorkflowActions();
  // 同源边的横向错开与断连都按端点值工作，画布边数组只从 reactflow store 取，
  // 投影边 id 不进 adapter；structureEdges 只作为「结构变了要重算」的依赖。
  const { getNode, getEdges, getEdge } = useReactFlow();

  // 端点所在容器折叠时隐藏整条边；容器 id 优先取 source，与旧实现一致。
  const sourceParentId = useNode(source, (node) => node?.data.parentNodeId);
  const targetParentId = useNode(target, (node) => node?.data.parentNodeId);
  const foldParentId = sourceParentId ?? targetParentId;
  const isFolded = !!useNode(foldParentId ?? '', (node) => node?.view.isFolded);

  const defaultZIndex = sourceParentId ? 2002 : 0;

  // Offset edges from same source horizontally to avoid visual overlap
  const edgeStepOffset = useMemo(() => {
    // 排序要用画布边 id 与拖拽中的实时位置，两者只存在于 reactflow store（Runtime 边不带画布 id），
    // 所以这里保留 getEdges()；O(E) 只在结构变化后跑一次（06 总纲决策 11）。
    const sameSourceEdges = getEdges().filter((e) => e.source === source);
    if (sameSourceEdges.length <= 1) return 0;

    // Sort edges by target node Y position
    // 按需查节点而不是先建一份 O(N) 的 map：比较器里的 getNode 是 store 的 O(1) 查找。
    const sortedEdges = [...sameSourceEdges].sort(
      (a, b) => (getNode(a.target)?.position?.y ?? 0) - (getNode(b.target)?.position?.y ?? 0)
    );

    const index = sortedEdges.findIndex((e) => e.id === id);
    const total = sortedEdges.length;
    const spacing = 20;
    const midPoint = Math.ceil(total / 2);
    const offset =
      index < midPoint
        ? (index - Math.floor(midPoint / 2)) * spacing
        : (Math.floor((total - midPoint) / 2) - (index - midPoint)) * spacing;

    const maxOffset = Math.abs(targetX - sourceX) * 0.25;
    return Math.max(-maxOffset, Math.min(maxOffset, offset));
    // structureEdges 是刻意的依赖：结构变化后 store 里的画布边才是新的。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureEdges, source, id, getNode, getEdges, sourceX, targetX]);

  const onDelConnect = useCallback(
    (id: string) => {
      const edge = getEdge(id);
      if (!edge) return;
      disconnectEdge({
        edge: {
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle || '',
          targetHandle: edge.targetHandle || ''
        }
      });
    },
    [getEdge, disconnectEdge]
  );

  // Selected edge or source/target node selected
  const [highlightEdge, setHighlightEdge] = useState(false);
  useThrottleEffect(
    () => {
      setHighlightEdge(endpointSelected || !!selected);
    },
    [endpointSelected, selected],
    {
      wait: 100
    }
  );

  const [, labelX, labelY] = getCustomStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    stepOffset: edgeStepOffset
  });

  const isToolEdge = sourceHandleId === NodeOutputKeyEnum.selectedTools;

  const { newTargetX, newTargetY } = useMemo(() => {
    if (targetPosition === 'left') {
      return {
        newTargetX: targetX - 7,
        newTargetY: targetY
      };
    }
    return {
      newTargetX: targetX,
      newTargetY: targetY
    };
  }, [targetPosition, targetX, targetY]);

  const edgeColor = useMemo(() => {
    // status 恒为 waiting/active/skipped 三者之一，所以「没有 status」等价于「没匹配到 runtime 边」。
    if (!debugStatus) {
      if (highlightEdge) return '#487FFF';
      return '#94B5FF';
    }

    // debug mode
    const colorMap = {
      active: '#487FFF',
      waiting: '#5E8FFF',
      skipped: '#8A95A7'
    };
    return colorMap[debugStatus];
  }, [debugStatus, highlightEdge]);

  const memoEdgeLabel = useMemo(() => {
    const arrowTransform = (() => {
      if (targetPosition === 'left') {
        return `translate(-89%, -49%) translate(${newTargetX}px,${newTargetY}px) rotate(0deg)`;
      }
      if (targetPosition === 'right') {
        return `translate(-10%, -50%) translate(${newTargetX}px,${newTargetY}px) rotate(-180deg)`;
      }
      if (targetPosition === 'bottom') {
        return `translate(-50%, -20%) translate(${newTargetX}px,${newTargetY}px) rotate(-90deg)`;
      }
      if (targetPosition === 'top') {
        return `translate(-50%, -90%) translate(${newTargetX}px,${newTargetY}px) rotate(90deg)`;
      }
    })();

    return (
      <EdgeLabelRenderer>
        <Box hidden={isFolded}>
          <Flex
            display={isHover || highlightEdge ? 'flex' : 'none'}
            alignItems={'center'}
            justifyContent={'center'}
            position={'absolute'}
            transform={`translate(-55%, -50%) translate(${labelX}px,${labelY}px)`}
            pointerEvents={'all'}
            w={'26px'}
            h={'26px'}
            bg={'white'}
            borderRadius={'18px'}
            cursor={'pointer'}
            zIndex={defaultZIndex + 1000}
            onClick={() => onDelConnect(id)}
          >
            <MyIcon name={'core/workflow/closeEdge'} w={'100%'}></MyIcon>
          </Flex>
          {!isToolEdge && (
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              position={'absolute'}
              transform={arrowTransform}
              pointerEvents={'all'}
              w={highlightEdge ? '18px' : '16px'}
              h={highlightEdge ? '18px' : '16px'}
              zIndex={highlightEdge ? defaultZIndex + 1000 : defaultZIndex}
            >
              <MyIcon
                name={highlightEdge ? 'core/workflow/edgeArrowBold' : 'core/workflow/edgeArrow'}
                w={'100%'}
                color={edgeColor}
              />
            </Flex>
          )}
        </Box>
      </EdgeLabelRenderer>
    );
  }, [
    isFolded,
    isHover,
    highlightEdge,
    labelX,
    labelY,
    defaultZIndex,
    isToolEdge,
    edgeColor,
    targetPosition,
    newTargetX,
    newTargetY,
    onDelConnect,
    id
  ]);

  const memoBezierEdge = useMemo(() => {
    const edgeStyle: React.CSSProperties = (() => {
      if (!hasDebugEndpoints) {
        return {
          ...style,
          ...(highlightEdge
            ? {
                strokeWidth: 4
              }
            : { strokeWidth: 3, zIndex: 2 })
        };
      }

      return {
        ...style,
        strokeWidth: 3
      };
    })();

    const [path] = getCustomStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX: newTargetX,
      targetY: newTargetY,
      targetPosition,
      borderRadius: 60,
      stepOffset: edgeStepOffset
    });

    return (
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...edgeStyle,
          stroke: edgeColor,
          display: isFolded ? 'none' : 'block'
        }}
      />
    );
  }, [
    hasDebugEndpoints,
    id,
    sourceX,
    sourceY,
    sourcePosition,
    newTargetX,
    newTargetY,
    targetPosition,
    edgeColor,
    edgeStepOffset,
    style,
    highlightEdge,
    isFolded
  ]);

  return (
    <>
      {memoBezierEdge}
      {memoEdgeLabel}
    </>
  );
};

export default React.memo(ButtonEdge);
