import { Box, Flex, FlexProps } from '@chakra-ui/react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React from 'react';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import { useI18n } from '@/web/context/I18n';

const DatasetTypeTag = ({ type, ...props }: { type: `${DatasetTypeEnum}` } & FlexProps) => {
  const { datasetT } = useI18n();

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
      {/* @ts-ignore */}
      <Box>{datasetT(item.label)}</Box>
    </Flex>
  );
};

export default DatasetTypeTag;
