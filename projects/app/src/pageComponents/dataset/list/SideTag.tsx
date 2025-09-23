import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React from 'react';
import { useTranslation } from 'next-i18next';

const SideTag = ({ type, ...props }: { type: `${DatasetTypeEnum}` } & FlexProps) => {
  if (type === DatasetTypeEnum.folder) return null;
  const { t } = useTranslation();

  const item = DatasetTypeMap[type] || DatasetTypeMap['dataset'];

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
      <MyIcon name={item.icon as any} w={'0.8rem'} color={'myGray.400'} />
      <Box fontSize={'mini'} ml={1}>
        {t(item.label)}
      </Box>
    </Flex>
  );
};

export default SideTag;
