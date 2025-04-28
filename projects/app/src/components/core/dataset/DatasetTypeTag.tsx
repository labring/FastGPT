import { Box, Flex, FlexProps } from '@chakra-ui/react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React from 'react';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';

const DatasetTypeTag = ({ type, ...props }: { type: `${DatasetTypeEnum}` } & FlexProps) => {
  const { t } = useTranslation();
  const item = DatasetTypeMap[type] || DatasetTypeMap['dataset'];

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
      <MyIcon name={item.icon as any} w={'16px'} mr={2} color={'myGray.400'} />
      <Box>{t(item.label as any)}</Box>
    </Flex>
  );
};

export default DatasetTypeTag;
