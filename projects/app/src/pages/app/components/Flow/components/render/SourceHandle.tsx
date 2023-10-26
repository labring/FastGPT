import React, { useMemo, useTransition } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { Handle, Position } from 'reactflow';
import { FlowValueTypeEnum, FlowValueTypeStyle, FlowValueTypeTip } from '@/constants/flow';
import MyTooltip from '@/components/MyTooltip';
import { useTranslation } from 'next-i18next';

interface Props extends BoxProps {
  handleKey: string;
  valueType?: `${FlowValueTypeEnum}`;
}

const SourceHandle = ({ handleKey, valueType, ...props }: Props) => {
  const { t } = useTranslation();

  const valType = valueType ?? FlowValueTypeEnum.any;

  const valueStyle = useMemo(
    () =>
      valueType
        ? FlowValueTypeStyle[valueType]
        : (FlowValueTypeStyle[FlowValueTypeEnum.any] as any),
    [valueType]
  );

  return (
    <Box
      position={'absolute'}
      top={'50%'}
      right={'-16px'}
      transform={'translate(50%,-50%)'}
      {...props}
    >
      <MyTooltip
        label={t('app.module.type', {
          type: t(FlowValueTypeTip[valType].label),
          example: FlowValueTypeTip[valType].example
        })}
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
      </MyTooltip>
    </Box>
  );
};

export default React.memo(SourceHandle);
