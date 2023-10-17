import React, { useMemo } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { Handle, OnConnect, Position } from 'reactflow';
import { FlowValueTypeEnum, FlowValueTypeStyle } from '@/constants/flow';
import MyTooltip from '@/components/MyTooltip';

interface Props extends BoxProps {
  handleKey: string;
  valueType?: `${FlowValueTypeEnum}`;
  onConnect?: OnConnect;
}

const TargetHandle = ({ handleKey, valueType, onConnect, ...props }: Props) => {
  const valueStyle = useMemo(
    () =>
      valueType
        ? FlowValueTypeStyle[valueType]
        : (FlowValueTypeStyle[FlowValueTypeEnum.any] as any),
    [valueType]
  );

  return (
    <Box
      key={handleKey}
      position={'absolute'}
      top={'50%'}
      left={'-16px'}
      transform={'translate(50%,-50%)'}
      {...props}
    >
      <MyTooltip label={`${valueType}类型`}>
        <Handle
          style={{
            width: '12px',
            height: '12px',
            ...valueStyle
          }}
          type="target"
          id={handleKey}
          position={Position.Left}
        />
      </MyTooltip>
    </Box>
  );
};

export default React.memo(TargetHandle);
