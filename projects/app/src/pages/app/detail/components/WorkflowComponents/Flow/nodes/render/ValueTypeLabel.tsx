import { FlowValueTypeMap } from '@/web/core/workflow/constants/dataType';
import { Box } from '@chakra-ui/react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React from 'react';

const ValueTypeLabel = ({ valueType }: { valueType?: WorkflowIOValueTypeEnum }) => {
  const valueTypeData = valueType ? FlowValueTypeMap[valueType] : undefined;

  const label = valueTypeData?.label || '';
  const description = valueTypeData?.description || '';

  return !!label ? (
    <MyTooltip label={description}>
      <Box
        bg={'myGray.100'}
        color={'myGray.500'}
        border={'base'}
        borderRadius={'sm'}
        ml={2}
        px={1}
        h={6}
        display={'flex'}
        alignItems={'center'}
        fontSize={'11px'}
      >
        {label}
      </Box>
    </MyTooltip>
  ) : null;
};

export default React.memo(ValueTypeLabel);
