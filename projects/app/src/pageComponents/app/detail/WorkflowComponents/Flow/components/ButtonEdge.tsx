import React, { useCallback, useMemo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  type Edge,
  type Node,
  type ConnectionLineComponentProps,
  useReactFlow
} from '@xyflow/react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { useThrottleEffect } from 'ahooks';
import { WorkflowNodeDataContext } from '../../context/workflowInitContext';
import { WorkflowDebugContext } from '../../context/workflowDebugContext';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { getCustomStepPath } from '../utils/edge';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

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
  const selectedNodesMap = useContextSelector(WorkflowNodeDataContext, (v) => v.selectedNodesMap);
  const { getNode, getEdges } = useReactFlow<Node<FlowNodeItemType>, Edge>();
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const setHoverEdgeId = useWorkflowStore((s) => s.setHoverEdgeId);
  const workflowDebugData = useContextSelector(WorkflowDebugContext, (v) => v.workflowDebugData);

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

  // If parentNode is folded, the edge will not be displayed
  const isFolded = useWorkflowStore((s) => {
    const sourceNode = s.getNodeById(source);
    if (sourceNode?.parentNodeId) {
      return !!s.getNodeById(sourceNode.parentNodeId)?.isFolded;
    }
    const targetNode = s.getNodeById(target);
    if (targetNode?.parentNodeId) {
      return !!s.getNodeById(targetNode.parentNodeId)?.isFolded;
    }
    return false;
  });

  const defaultZIndex = useWorkflowStore((s) => {
    const sourceNode = s.getNodeById(source);
    if (sourceNode?.parentNodeId) return 2002;
    const targetNode = s.getNodeById(target);
    if (targetNode?.parentNodeId) return 2002;
    return 0;
  });

  // Offset edges from same source horizontally to avoid visual overlap
  const edgeStepOffset = useMemo(() => {
    const allEdges = getEdges();
    const sameSourceEdges = allEdges.filter((e) => e.source === source);
    if (sameSourceEdges.length <= 1) return 0;

    // Sort edges by target node Y position using O(1) getNode lookup
    const sortedEdges = [...sameSourceEdges].sort((a, b) => {
      const nodeA = getNode(a.target);
      const nodeB = getNode(b.target);
      return (nodeA?.position?.y ?? 0) - (nodeB?.position?.y ?? 0);
    });

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
  }, [getEdges, getNode, source, id, sourceX, targetX]);

  const onDelConnect = useCallback(
    (edgeId: string) => {
      setEdges((edges) => edges.filter((edge) => edge.id !== edgeId));
    },
    [setEdges]
  );

  // Selected edge or source/target node selected
  const [highlightEdge, setHighlightEdge] = useState(false);
  useThrottleEffect(
    () => {
      const isSourceSelected = selectedNodesMap[props.source];
      const isTargetSelected = selectedNodesMap[props.target];
      setHighlightEdge(isSourceSelected || isTargetSelected || !!selected);
    },
    [selectedNodesMap, props.source, props.target, selected],
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
  const isHover = useWorkflowStore((s) => s.hoverEdgeId === id);

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
    const targetEdge = workflowDebugData?.runtimeEdges.find(
      (edge) => edge.sourceHandle === sourceHandleId && edge.targetHandle === targetHandleId
    );
    if (!targetEdge) {
      if (highlightEdge) return '#487FFF';
      return '#94B5FF';
    }

    // debug mode
    const colorMap = {
      active: '#487FFF',
      waiting: '#5E8FFF',
      skipped: '#8A95A7'
    };
    return colorMap[targetEdge.status];
  }, [highlightEdge, sourceHandleId, targetHandleId, workflowDebugData?.runtimeEdges]);

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
            onMouseEnter={() => setHoverEdgeId(id)}
            onClick={(e) => {
              e.stopPropagation();
              onDelConnect(id);
            }}
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
    setHoverEdgeId,
    id
  ]);

  const memoBezierEdge = useMemo(() => {
    const targetEdge = workflowDebugData?.runtimeEdges.find(
      (edge) => edge.source === source && edge.target === target
    );

    const edgeStyle: React.CSSProperties = (() => {
      if (!targetEdge) {
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
        interactionWidth={props.interactionWidth ?? 20}
        style={{
          ...edgeStyle,
          stroke: edgeColor,
          display: isFolded ? 'none' : 'block'
        }}
      />
    );
  }, [
    workflowDebugData?.runtimeEdges,
    id,
    sourceX,
    sourceY,
    sourcePosition,
    newTargetX,
    newTargetY,
    targetPosition,
    edgeColor,
    edgeStepOffset,
    source,
    target,
    style,
    highlightEdge,
    isFolded,
    props.interactionWidth
  ]);

  return (
    <>
      {memoBezierEdge}
      {memoEdgeLabel}
    </>
  );
};

export default React.memo(ButtonEdge);
