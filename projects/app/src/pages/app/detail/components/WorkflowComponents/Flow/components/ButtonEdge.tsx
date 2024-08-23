import React, { useCallback, useMemo } from 'react';
import { BezierEdge, getBezierPath, EdgeLabelRenderer, EdgeProps } from 'reactflow';
import { Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { NodeOutputKeyEnum, RuntimeEdgeStatusEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const ButtonEdge = (props: EdgeProps) => {
  const { nodes, setEdges, workflowDebugData, hoverEdgeId } = useContextSelector(
    WorkflowContext,
    (v) => v
  );

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

  const onDelConnect = useCallback(
    (id: string) => {
      setEdges((state) => {
        const newState = state.filter((item) => item.id !== id);
        return newState;
      });
    },
    [setEdges]
  );

  const highlightEdge = useMemo(() => {
    const connectNode = nodes.find((node) => {
      return node.selected && (node.id === props.source || node.id === props.target);
    });
    return !!(connectNode || selected);
  }, [nodes, props.source, props.target, selected]);

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
      if (highlightEdge) return '#3370ff';
      return '#94B5FF';
    }

    // debug mode
    const colorMap = {
      [RuntimeEdgeStatusEnum.active]: '#39CC83',
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
        <Flex
          display={isHover || highlightEdge ? 'flex' : 'none'}
          alignItems={'center'}
          justifyContent={'center'}
          position={'absolute'}
          transform={`translate(-55%, -50%) translate(${labelX}px,${labelY}px)`}
          pointerEvents={'all'}
          w={'17px'}
          h={'17px'}
          bg={'white'}
          borderRadius={'17px'}
          cursor={'pointer'}
          zIndex={1000}
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
            // bg={'white'}
            zIndex={highlightEdge ? 1000 : 0}
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
      </EdgeLabelRenderer>
    );
  }, [
    isHover,
    highlightEdge,
    labelX,
    labelY,
    isToolEdge,
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
        strokeWidth: 3,
        zIndex: 2
      };
    })();

    return (
      <BezierEdge
        {...props}
        targetX={newTargetX}
        targetY={newTargetY}
        style={{
          ...edgeStyle,
          stroke: edgeColor
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
    highlightEdge
  ]);

  return (
    <>
      {memoBezierEdge}
      {memoEdgeLabel}
    </>
  );
};

export default React.memo(ButtonEdge);
