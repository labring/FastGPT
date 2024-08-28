import { Box, Flex, FlexProps } from '@chakra-ui/react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';

const SideTag = ({ type, ...props }: { type: `${DatasetTypeEnum}` } & FlexProps) => {
  if (type === DatasetTypeEnum.folder) return null;
  const { t } = useTranslation();
  const DatasetListTypeMap = useMemo(() => {
    return {
      [DatasetTypeEnum.dataset]: {
        icon: 'core/dataset/commonDatasetOutline',
        label: t('dataset:common_dataset')
      },
      [DatasetTypeEnum.websiteDataset]: {
        icon: 'core/dataset/websiteDatasetOutline',
        label: t('dataset:website_dataset')
      },
      [DatasetTypeEnum.externalFile]: {
        icon: 'core/dataset/externalDatasetOutline',
        label: t('dataset:external_file')
      }
    };
  }, [t]);
  const item = DatasetListTypeMap[type] || DatasetListTypeMap['dataset'];

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
        {item.label}
      </Box>
    </Flex>
  );
};

export default SideTag;
