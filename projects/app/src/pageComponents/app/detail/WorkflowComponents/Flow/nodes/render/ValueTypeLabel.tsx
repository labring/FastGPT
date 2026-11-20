import {
  datasetQuoteValueDesc,
  datasetQuoteValueDescWithSynonym,
  getFlowValueTypeMeta
} from '@fastgpt/global/core/workflow/node/constant';
import type { BoxProps } from '@chakra-ui/react';
import { Box } from '@chakra-ui/react';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const ValueTypeLabel = ({
  valueType,
  valueDesc,
  ...props
}: {
  valueType?: WorkflowIOValueTypeEnum;
  valueDesc?: string;
} & BoxProps) => {
  const { t } = useTranslation();
  const datasetSynonymEnabled = useSystemStore(
    (state) => state.feConfigs?.datasetSynonymEnabled === true
  );
  const label = valueType ? getFlowValueTypeMeta(valueType).label : '';
  // 同义词字段只在能力开启的部署中展示，关闭时保持原始引用结构说明。
  const resolvedValueDesc =
    datasetSynonymEnabled && valueDesc === datasetQuoteValueDesc
      ? datasetQuoteValueDescWithSynonym
      : valueDesc;

  return !!label ? (
    <MyTooltip label={resolvedValueDesc}>
      <Box
        bg={'myGray.100'}
        color={'myGray.500'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        borderRadius={'sm'}
        ml={2}
        px={1}
        h={6}
        display={'flex'}
        alignItems={'center'}
        fontSize={'11px'}
        {...props}
      >
        {t(label as any)}
      </Box>
    </MyTooltip>
  ) : null;
};

export default React.memo(ValueTypeLabel);
