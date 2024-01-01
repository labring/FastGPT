import React, { useMemo } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { Handle, OnConnect, Position } from 'reactflow';
import { FlowValueTypeMap } from '@/web/core/modules/constants/dataType';
import MyTooltip from '@/components/MyTooltip';
import { useTranslation } from 'next-i18next';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';

interface Props extends BoxProps {
  handleKey: string;
  valueType?: `${ModuleIOValueTypeEnum}`;
}

const TargetHandle = ({ handleKey, valueType, ...props }: Props) => {
  const { t } = useTranslation();

  const valType = valueType ?? ModuleIOValueTypeEnum.any;
  const valueStyle = useMemo(
    () =>
      valueType && FlowValueTypeMap[valueType]
        ? FlowValueTypeMap[valueType]?.handlerStyle
        : FlowValueTypeMap[ModuleIOValueTypeEnum.any]?.handlerStyle,
    [valueType]
  );

  return (
    <Box
      position={'absolute'}
      top={'50%'}
      left={'-18px'}
      transform={'translate(50%,-50%)'}
      {...props}
    >
      <MyTooltip
        label={t('app.module.type', {
          type: t(FlowValueTypeMap[valType]?.label),
          description: FlowValueTypeMap[valType]?.description
        })}
      >
        <Handle
          style={{
            width: '14px',
            height: '14px',
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
