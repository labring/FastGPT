import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import type { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const DatasetTypeTag = ({ type, ...props }: { type: `${DatasetTypeEnum}` } & FlexProps) => {
  const { t, i18n } = useTranslation();
  const { getDatasetTypeConfig } = useSystemStore();

  const config = useMemo(
    () =>
      getDatasetTypeConfig(type, t, i18n.language) ||
      getDatasetTypeConfig('dataset', t, i18n.language),
    [type, t, i18n.language, getDatasetTypeConfig]
  );

  return (
    <Flex
      bg={'myGray.100'}
      borderWidth={'1px'}
      borderColor={'myGray.200'}
      px={3}
      py={1.5}
      h={'1.75rem'}
      borderRadius={'sm'}
      fontSize={'xs'}
      alignItems={'center'}
      {...props}
    >
      <Avatar src={config?.icon} w={'16px'} mr={2} color={'myGray.400'} />
      <Box>{config?.label}</Box>
    </Flex>
  );
};

export default DatasetTypeTag;
