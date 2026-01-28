import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { usePluginStore } from '@/web/core/plugin/store/plugin';

const SideTag = ({
  type,
  ...props
}: {
  type: string;
} & FlexProps) => {
  if (type === 'folder') return null;
  const { t, i18n } = useTranslation();
  const { getDatasetTypeConfig } = usePluginStore();

  const config = useMemo(
    () => getDatasetTypeConfig(type, t, i18n.language),
    [type, t, i18n.language, getDatasetTypeConfig]
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
