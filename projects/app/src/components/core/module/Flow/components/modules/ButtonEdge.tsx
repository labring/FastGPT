import React from 'react';
import {
  BezierEdge,
  getBezierPath,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath
} from 'reactflow';
import { Flex } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';

const ButtonEdge = (
  props: EdgeProps<{
    onDelete: (id: string) => void;
  }>
) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    style = {}
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const edgeStyle: React.CSSProperties = {
    ...style,
    ...(selected
      ? {
          strokeWidth: 4,
          stroke: '#3370ff'
        }
      : { strokeWidth: 2, stroke: '#BDC1C5' })
  };

  return (
    <>
      <BezierEdge {...props} style={edgeStyle} />
      <EdgeLabelRenderer>
        <Flex
          alignItems={'center'}
          justifyContent={'center'}
          position={'absolute'}
          transform={`translate(-50%, -50%) translate(${labelX}px,${labelY}px)`}
          pointerEvents={'all'}
          w={'20px'}
          h={'20px'}
          bg={'white'}
          borderRadius={'20px'}
          color={'black'}
          cursor={'pointer'}
          border={'1px solid #fff'}
          zIndex={selected ? 1000 : 0}
          _hover={{
            boxShadow: '0 0 6px 2px rgba(0, 0, 0, 0.08)'
          }}
          onClick={() => data?.onDelete(id)}
        >
          <MyIcon
            name="closeSolid"
            w={'100%'}
            color={selected ? 'blue.700' : 'myGray.500'}
          ></MyIcon>
        </Flex>
      </EdgeLabelRenderer>
    </>
  );
};

export default React.memo(ButtonEdge);
