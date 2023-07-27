import React, { useMemo } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { Handle, Position } from 'reactflow';
import { FlowValueTypeEnum, FlowValueTypeStyle } from '@/constants/flow';

interface Props extends BoxProps {
  handleKey: string;
  valueType?: `${FlowValueTypeEnum}`;
}

const SourceHandle = ({ handleKey, valueType, ...props }: Props) => {
  const valueStyle = useMemo(
    () =>
      valueType
        ? FlowValueTypeStyle[valueType]
        : (FlowValueTypeStyle[FlowValueTypeEnum.other] as any),
    []
  );

  return (
    <Box
      position={'absolute'}
      top={'50%'}
      right={'-16px'}
      transform={'translate(50%,-50%)'}
      {...props}
    >
      <Handle
        style={{
          width: '12px',
          height: '12px',
          ...valueStyle
        }}
        type="source"
        id={handleKey}
        position={Position.Right}
      />
    </Box>
  );
};

export default SourceHandle;
