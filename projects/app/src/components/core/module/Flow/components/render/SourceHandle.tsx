import React, { useMemo, useTransition } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { Handle, Position } from 'reactflow';
import { FlowValueTypeStyle, FlowValueTypeMap } from '@/web/core/modules/constants/dataType';
import MyTooltip from '@/components/MyTooltip';
import { useTranslation } from 'next-i18next';
import { ModuleDataTypeEnum } from '@fastgpt/global/core/module/constants';

interface Props extends BoxProps {
  handleKey: string;
  valueType?: `${ModuleDataTypeEnum}`;
}

const SourceHandle = ({ handleKey, valueType, ...props }: Props) => {
  const { t } = useTranslation();

  const valType = valueType ?? ModuleDataTypeEnum.any;

  const valueStyle = useMemo(
    () =>
      valueType
        ? FlowValueTypeStyle[valueType]
        : (FlowValueTypeStyle[ModuleDataTypeEnum.any] as any),
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
          type: t(FlowValueTypeMap[valType].label),
          example: FlowValueTypeMap[valType].example
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
