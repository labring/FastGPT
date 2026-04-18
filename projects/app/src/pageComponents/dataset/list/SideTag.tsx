import { Box, type FlexProps } from '@chakra-ui/react';
import type { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import React from 'react';
import { useTranslation } from 'next-i18next';

const SideTag = ({ type, ...props }: { type: `${DatasetTypeEnum}` } & FlexProps) => {
  const { t } = useTranslation();

  const item = DatasetTypeMap[type] || DatasetTypeMap['dataset'];

  return (
    <Box bg={'myGray.100'} py={0.75} px={'8px'} borderRadius={'md'} fontSize={'mini'} {...props}>
      {t(item.label)}
    </Box>
  );
};

export default SideTag;
