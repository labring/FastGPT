import React, { useCallback, useMemo, useState } from 'react';
import { BezierEdge, getBezierPath, EdgeLabelRenderer, EdgeProps } from 'reactflow';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { NodeOutputKeyEnum, RuntimeEdgeStatusEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { useThrottleEffect } from 'ahooks';
import { WorkflowNodeEdgeContext, WorkflowInitContext } from '../../context/workflowInitContext';
import { WorkflowEventContext } from '../../context/workflowEventContext';

const ButtonEdge = (props: EdgeProps) => {
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const onEdgesChange = useContextSelector(WorkflowNodeEdgeContext, (v) => v.onEdgesChange);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const workflowDebugData = useContextSelector(WorkflowContext, (v) => v.workflowDebugData);
  const hoverEdgeId = useContextSelector(WorkflowEventContext, (v) => v.hoverEdgeId);

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
  const parentNode = useMemo(() => {
    for (const node of nodeList) {
      if ((node.nodeId === source || node.nodeId === target) && node.parentNodeId) {
        return nodeList.find((parent) => parent.nodeId === node.parentNodeId);
      }
    }
    return undefined;
  }, [nodeList, source, target]);

  const defaultZIndex = useMemo(
    () => (nodeList.find((node) => node.nodeId === source && node.parentNodeId) ? 2002 : 0),
    [nodeList, source]
  );

  const onDelConnect = useCallback(
    (id: string) => {
      onEdgesChange([
        {
          type: 'remove',
          id
        }
      ]);
    },
    [onEdgesChange]
  );

  // Selected edge or source/target node selected
  const [highlightEdge, setHighlightEdge] = useState(false);
  useThrottleEffect(
    () => {
      const connectNode = nodes.find((node) => {
        return node.selected && (node.id === props.source || node.id === props.target);
      });
      setHighlightEdge(!!connectNode || !!selected);
    },
    [nodes, selected, props.source, props.target],
    {
      wait: 100
    }
  );

  const [, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const isToolEdge = sourceHandleId === NodeOutputKeyEnum.selectedTools;
  const isHover = hoverEdgeId === id;

  const { newTargetX, newTargetY } = useMemo(() => {
    if (targetPosition === 'left') {
      return {
        newTargetX: targetX - 3,
        newTargetY: targetY
      };
    }
    if (targetPosition === 'right') {
      return {
        newTargetX: targetX + 3,
        newTargetY: targetY
      };
    }
    if (targetPosition === 'bottom') {
      return {
        newTargetX: targetX,
        newTargetY: targetY + 3
      };
    }
    if (targetPosition === 'top') {
      return {
        newTargetX: targetX,
        newTargetY: targetY - 3
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
      [RuntimeEdgeStatusEnum.active]: '#487FFF',
      [RuntimeEdgeStatusEnum.waiting]: '#5E8FFF',
      [RuntimeEdgeStatusEnum.skipped]: '#8A95A7'
    };
    return colorMap[targetEdge.status];
  }, [highlightEdge, sourceHandleId, targetHandleId, workflowDebugData?.runtimeEdges]);

  const memoEdgeLabel = useMemo(() => {
    const arrowTransform = (() => {
      if (targetPosition === 'left') {
        return `translate(-85%, -47%) translate(${newTargetX}px,${newTargetY}px) rotate(0deg)`;
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
        <Box hidden={parentNode?.isFolded}>
          <Flex
            display={isHover || highlightEdge ? 'flex' : 'none'}
            alignItems={'center'}
            justifyContent={'center'}
            position={'absolute'}
            transform={`translate(-55%, -50%) translate(${labelX}px,${labelY}px)`}
            pointerEvents={'all'}
            w={'18px'}
            h={'18px'}
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
              w={highlightEdge ? '14px' : '10px'}
              h={highlightEdge ? '14px' : '10px'}
              zIndex={highlightEdge ? defaultZIndex + 1000 : defaultZIndex}
            >
              <MyIcon
                name={'core/workflow/edgeArrow'}
                w={'100%'}
                color={edgeColor}
                {...(highlightEdge
                  ? {
                      fontWeight: 'bold'
                    }
                  : {})}
              ></MyIcon>
            </Flex>
          )}
        </Box>
      </EdgeLabelRenderer>
    );
  }, [
    parentNode?.isFolded,
    isHover,
    highlightEdge,
    labelX,
    labelY,
    isToolEdge,
    defaultZIndex,
    edgeColor,
    targetPosition,
    newTargetX,
    newTargetY,
    onDelConnect,
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
                strokeWidth: 5
              }
            : { strokeWidth: 3, zIndex: 2 })
        };
      }

      return {
        ...style,
        strokeWidth: 3
      };
    })();

    return (
      <BezierEdge
        {...props}
        targetX={newTargetX}
        targetY={newTargetY}
        style={{
          ...edgeStyle,
          stroke: edgeColor,
          display: parentNode?.isFolded ? 'none' : 'block'
        }}
      />
    );
  }, [
    workflowDebugData?.runtimeEdges,
    props,
    newTargetX,
    newTargetY,
    edgeColor,
    source,
    target,
    style,
    highlightEdge,
    parentNode?.isFolded
  ]);

  return (
    <>
      {memoBezierEdge}
      {memoEdgeLabel}
    </>
  );
};

export default React.memo(ButtonEdge);
