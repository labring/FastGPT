import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const SideTag = ({
  type,
  sourceId,
  ...props
}: {
  type: `${DatasetTypeEnum}`;
  sourceId?: string;
} & FlexProps) => {
  if (type === DatasetTypeEnum.folder) return null;
  const { t, i18n } = useTranslation();
  const { getDatasetTypeConfig } = useSystemStore();

  const config = useMemo(
    () => getDatasetTypeConfig(sourceId || type, t, i18n.language),
    [sourceId, type, t, i18n.language, getDatasetTypeConfig]
  );

  return (
    <Flex
      bg={'myGray.100'}
      py={0.75}
      pl={'8px'}
      pr={'12px'}
      borderRadius={'md'}
      fontSize={'xs'}
      alignItems={'center'}
      {...props}
    >
      <Avatar src={config?.icon} w={'0.8rem'} />
      <Box fontSize={'mini'} ml={1}>
        {config?.label}
      </Box>
    </Flex>
  );
};

export default SideTag;
